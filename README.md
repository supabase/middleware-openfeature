# `@supabase-labs/middleware-openfeature`

Typed [OpenFeature](https://openfeature.dev) flag resolution as a
[`@supabase/middleware`](https://github.com/supabase/middleware) middleware.

Declare your flags with their mandatory defaults, hand it any OpenFeature server
client, and every declared flag is resolved concurrently per request and lands at
`ctx.flags`, typed from the defaults.

```ts
import { OpenFeature } from '@openfeature/server-sdk'
import { createWithOpenFeature } from '@supabase-labs/middleware-openfeature'

const withFlags = createWithOpenFeature({
  client: OpenFeature.getClient(),
  flags: { betaCheckout: false, theme: 'light', maxItems: 10 },
})

export default {
  fetch: withFlags(async (_req, ctx) => {
    ctx.flags.betaCheckout // boolean
    ctx.flags.theme // string
    ctx.flags.maxItems // number
    return Response.json(ctx.flags)
  }),
}
```

`createWithOpenFeature` builds the middleware where the flags are known. The
result is a plain `@supabase/middleware` middleware, called with no config:
`withFlags(handler)` nested, or `withFlags()` as a `pipeline` entry.

## Install

```bash
npm install @supabase-labs/middleware-openfeature @openfeature/server-sdk
```

`@openfeature/server-sdk` is **yours, not ours**. This package depends only on
`@supabase/middleware` and the zero-dependency `@openfeature/core`, and accepts
the client structurally — so it never pulls `@openfeature/server-sdk`'s
`node:events` into your bundle, and you stay free to pick your own SDK version.

**Requires TypeScript >= 5.4.** The published types use `NoInfer`, a 5.4
intrinsic.

## How it works

`flags` is a map of key to its **mandatory** default. There is no way to declare
a flag without one — that is the OpenFeature invariant, and it is why resolution
can never fail.

Each default's _runtime_ type selects the resolution method:

| Default                               | Method called       |
| ------------------------------------- | ------------------- |
| `boolean`                             | `getBooleanDetails` |
| `string`                              | `getStringDetails`  |
| `number`                              | `getNumberDetails`  |
| anything else (object, array, `null`) | `getObjectDetails`  |

All declared flags resolve **concurrently**, so a stack of ten flags costs one
round trip's latency rather than ten.

### The declared default's type must match the flag's type

This is the one sharp edge. The default you write picks the resolution method,
so if it disagrees with the flag's type in your provider, the provider returns a
`TYPE_MISMATCH` error, the flag falls back to your default, and **nothing tells
you at runtime**:

```ts
// `theme` is a STRING flag in the provider
createWithOpenFeature({ client, flags: { theme: false } })
//                                      ^^^^^ boolean
// ctx.flags.theme === false, with a 200 response and no error anywhere
```

`ctx.flags` holds values, not details, so a handler cannot tell a real `false`
from a fallback `false`. That is a deliberate trade — see below — but it means
a wrong default type fails silently.

If you need to check, ask your OpenFeature client directly and look at `reason`:

```ts
const details = await client.getBooleanDetails('theme', false)
details.reason // 'ERROR' with errorCode 'TYPE_MISMATCH' when the type is wrong
```

### It never gates

The middleware never short-circuits. An OpenFeature client already returns the
default with `reason: 'ERROR'` rather than throwing; if a client rejects anyway,
the flag falls back to its declared default and the handler still runs. A
provider outage is not a bad _request_, so there is nothing to reject.

If you want to _gate_ on a flag, that is
[`withFeatureFlag`](https://github.com/supabase/middleware)'s job.

### `ctx.flags` holds values, not details

`EvaluationDetails` also carries `reason`, `variant`, `errorCode` and
`flagMetadata`. Those matter when debugging a flag that silently fell back — but
they belong on **your** OpenFeature client, via
[OpenFeature hooks](https://openfeature.dev/docs/reference/concepts/hooks), which
is a standard feature of the client you already own. This package adds no surface
for it, and contributes exactly one `ctx` key.

## Targeting

`context` builds the OpenFeature evaluation context per request. It receives the
`Request` and the upstream context, so a targeting key can come from an upstream
auth middleware. Annotate the keys it reads: they become the middleware's
prerequisites.

```ts
import { pipeline } from '@supabase/middleware'
import { withClaims } from '@supabase/server'
import type { JWTClaims } from '@supabase/server'

const withFlags = createWithOpenFeature({
  client,
  flags: { betaCheckout: false },
  context: (_req, ctx: { jwtClaims: JWTClaims | null }) => ({
    targetingKey: ctx.jwtClaims?.sub ?? 'anon',
  }),
})

// nested
withClaims(
  withFlags(async (_req, ctx) =>
    Response.json({ beta: ctx.flags.betaCheckout }),
  ),
)

// pipeline
pipeline([withClaims(), withFlags()], async (_req, ctx) =>
  Response.json({ beta: ctx.flags.betaCheckout }),
)
```

A stack with no provider for `jwtClaims` does not compile. `pipeline` names the
key: `middleware-prereq: key 'jwtClaims' is not yet on the context`. Nested, the
produced handler still requires `jwtClaims`, so it fails wherever a handler is
expected: `satisfies FetchHandler`, a typed export, or `Deno.serve`.

Every key in the annotation is a prerequisite, so annotate the keys the callback
reads rather than a whole context type such as `SupabaseContext`. An unannotated
`ctx` has no keys, so reading one fails at the callback. A callback that reads
only the request adds no prerequisite.

## `withOpenFeature` (deprecated)

`withOpenFeature` takes its config at each call and publishes a hand-written
signature. It is removed at the next major. Moving to `createWithOpenFeature`:

```ts
// withOpenFeature
withClaims(withOpenFeature({ client, flags, context }, handler))
pipeline([withClaims(), withOpenFeature({ client, flags, context })], handler)

// createWithOpenFeature
const withFlags = createWithOpenFeature({ client, flags, context })
withClaims(withFlags(handler))
pipeline([withClaims(), withFlags()], handler)
```

- The config moves from the middleware call to the factory.
- Nested, `withOpenFeature` types the `context` callback's `ctx` from the
  enclosing layers. `createWithOpenFeature` does not: annotate what the callback
  reads, as the `pipeline` form of `withOpenFeature` already requires. The
  annotation is then a checked prerequisite in both forms. In
  `withOpenFeature`'s `pipeline` form, nothing checks it.

## Bring your own client

`FlagClient` is four methods. Any OpenFeature server client satisfies it as-is,
and anything else can implement it directly:

```ts
import type { FlagClient } from '@supabase-labs/middleware-openfeature'

const client: FlagClient = {
  async getBooleanDetails(flagKey, defaultValue) {
    return { flagKey, value: defaultValue, reason: 'STATIC' }
  },
  // …getStringDetails, getNumberDetails, getObjectDetails
}
```

## Running on Deno and Supabase Edge Functions

Verified end to end against a real Vercel flag on **both** plain Deno 2.7.8 and
the Supabase Edge Runtime 1.74.3. A string flag resolved to its dashboard value
with `reason: STATIC` and arrived at `ctx.flags` unchanged, on both runtimes.

Two things worth reading before you try it: the provider reads `FLAGS`, not
`EDGE_CONFIG`, and it needs `sys` access to `"hostname"` at module load. Full
results, including the OIDC token's 12-hour limit and why an SDK key is the
better credential, are in
[`docs/deno-vercel-findings.md`](./docs/deno-vercel-findings.md).

## Examples

Four handlers — Vercel Flags and PostHog, basic and claims-based targeting —
each running unmodified on Supabase Edge Functions, Vercel Functions and
Cloudflare Workers. Eight of the twelve combinations are verified against live
providers.

See [`examples/`](./examples/README.md), which also carries the credentials
matrix: Vercel Flags needs nothing on Vercel and an SDK key everywhere else.

## Development

```bash
pnpm install
pnpm typecheck           # source + must-compile type tests
pnpm typecheck:negative  # must-NOT-compile type tests, message-asserted
pnpm typecheck:consumer  # a consumer at the TypeScript 5.4 floor
pnpm test
pnpm build
```

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please).
Conventional commits merged to `main` accumulate into a release PR; merging
that PR publishes to npm via OIDC trusted publishing, with no token stored in
the repo.

Commit type determines the version bump: `fix:` is a patch, `feat:` is a
minor. While the package is pre-1.0, `feat!:`/`BREAKING CHANGE:` commits also
bump minor rather than major, per `bump-minor-pre-major` in
`release-please-config.json`.

## License

MIT
