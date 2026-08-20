# `@supabase/middleware-openfeature`

Typed [OpenFeature](https://openfeature.dev) flag resolution as a
[`@supabase/middleware`](https://github.com/supabase/middleware) middleware.

Declare your flags with their mandatory defaults, hand it any OpenFeature server
client, and every declared flag is resolved concurrently per request and lands at
`ctx.flags`, typed from the defaults.

```ts
import { OpenFeature } from '@openfeature/server-sdk'
import { withOpenFeature } from '@supabase/middleware-openfeature'

const client = OpenFeature.getClient()

export default {
  fetch: withOpenFeature(
    { client, flags: { betaCheckout: false, theme: 'light', maxItems: 10 } },
    async (_req, ctx) => {
      ctx.flags.betaCheckout // boolean
      ctx.flags.theme // string
      ctx.flags.maxItems // number
      return Response.json(ctx.flags)
    },
  ),
}
```

## Install

```bash
npm install @supabase/middleware-openfeature @openfeature/server-sdk
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
`Request` and the accumulated upstream context, so a targeting key can come from
an upstream auth middleware:

```ts
import { withClaims } from '@supabase/server'

withClaims(
  withOpenFeature(
    {
      client,
      flags: { betaCheckout: false },
      context: (_req, ctx) => ({ targetingKey: ctx.jwtClaims?.sub ?? 'anon' }),
    },
    async (_req, ctx) => Response.json({ beta: ctx.flags.betaCheckout }),
  ),
)
```

### With `pipeline`, a context callback that reads upstream needs one annotation

```ts
import { pipeline } from '@supabase/middleware'
import { withClaims } from '@supabase/server'
import type { JWTClaims } from '@supabase/server'

pipeline(
  [
    withClaims(),
    withOpenFeature({
      client,
      flags: { betaCheckout: false },
      //                                  ↓ this annotation is required
      context: (_req, ctx: { jwtClaims: JWTClaims | null }) => ({
        targetingKey: ctx.jwtClaims?.sub ?? 'anon',
      }),
    }),
  ],
  async (_req, ctx) => Response.json({ beta: ctx.flags.betaCheckout }),
)
```

**Why:** `withOpenFeature({…})` is a complete expression, so TypeScript checks it
_before_ `pipeline` sees the array. Array-position information cannot flow
backwards into an already-checked argument. It is inherent to evaluation order,
not a defect.

**What it does not affect:** composition, ordering, prerequisites, and handler
typing all work normally under `pipeline` — the handler sees every upstream key
and `ctx.flags` at full fidelity, with nothing annotated. And a `context`
callback that ignores the upstream context needs no annotation either. At runtime
the accumulated context is passed through in both forms, so only the static type
differs.

## Bring your own client

`FlagClient` is four methods. Any OpenFeature server client satisfies it as-is,
and anything else can implement it directly:

```ts
import type { FlagClient } from '@supabase/middleware-openfeature'

const client: FlagClient = {
  async getBooleanDetails(flagKey, defaultValue) {
    return { flagKey, value: defaultValue, reason: 'STATIC' }
  },
  // …getStringDetails, getNumberDetails, getObjectDetails
}
```

## Running on Deno and Supabase Edge Functions

This package was smoke-tested against Vercel Flags on both plain Deno and the
Supabase Edge Runtime. Everything on the Supabase side works — including the
`sys`/`hostname` permission the Vercel provider needs at module load, which is
the one thing that could have made the integration impossible. The results,
including what is still unproven and why, are in
[`docs/deno-vercel-findings.md`](./docs/deno-vercel-findings.md).

## Development

```bash
pnpm install
pnpm typecheck           # source + must-compile type tests
pnpm typecheck:negative  # must-NOT-compile type tests, message-asserted
pnpm typecheck:consumer  # a consumer at the TypeScript 5.4 floor
pnpm test
pnpm build
```

This package was built from scratch against
[`docs/authoring-guide.md`](https://github.com/supabase/middleware/blob/main/docs/authoring-guide.md)
as a dogfooding exercise. Every place the guide fell short is recorded in
[`docs/authoring-guide-friction.md`](./docs/authoring-guide-friction.md).

## License

MIT
