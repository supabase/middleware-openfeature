# Examples

Four handlers — Vercel Flags and PostHog, each with a basic and a claims-based
version — running unmodified on **Supabase Edge Functions**, **Vercel Functions**
and **Cloudflare Workers**.

The handler files are the only real code. Everything under `runtimes/` is three
to five lines of adaptation per entry point.

```
handlers/          the logic — imported unchanged by all three runtimes
providers/         builds an OpenFeature client from Vercel Flags or PostHog
runtimes/
  supabase/        Deno.serve
  vercel/          export default handler
  cloudflare/      export default { fetch }
```

## Credentials — read this first

This is the part that is genuinely fiddly, and it is not documented anywhere
else.

| Runtime                     | Vercel Flags                                           | PostHog           |
| --------------------------- | ------------------------------------------------------ | ----------------- |
| **Vercel Functions**        | **nothing** — the platform injects `VERCEL_OIDC_TOKEN` | `POSTHOG_API_KEY` |
| **Supabase Edge Functions** | **SDK key** in `FLAGS`                                 | `POSTHOG_API_KEY` |
| **Cloudflare Workers**      | **SDK key** in `FLAGS`                                 | `POSTHOG_API_KEY` |

**Vercel Flags needs no credential on Vercel.** OIDC is ambient there, which is
why Vercel's own quickstart never mentions SDK keys — and why "it just works" on
Vercel does not transfer anywhere else.

**Off Vercel, use an SDK key** (`vf_server_…`, from the dashboard under
Flags → SDK Keys). A hand-pulled OIDC token (`vercel env pull`) also
authenticates on Deno, but these examples do not use one:

- it expires after 12 hours
- on **Cloudflare Workers it does not work at all** — verified in a clean
  isolate, workerd fails with `No flag definitions available. Bundled
definitions not found.` while the identical token succeeds on Deno

Two things that look like credentials and are not:

- **`FLAGS_SECRET`**, which `vercel env pull` returns, is the Flags SDK's signing
  secret for the Flags Explorer. It plays no part in evaluation.
- **`EDGE_CONFIG`** is not read by the entry point these examples use. The
  package's own source says the default client "relies on `process.env.FLAGS`"
  and "does not use `process.env.EDGE_CONFIG`".

**The SDK key selects which environment is evaluated.** The same flag read
`"yellow"` under an OIDC token and `"green"` under a Development SDK key. That is
the documented mechanism, not a bug.

For PostHog you need a **project API key** (`phc_…`, Settings → Project) and a
host. These examples use remote evaluation, so no secure API key and no polling.

## Two things that fail silently

Both are worth knowing before you trust a green response.

### 1. The declared default's type must match the flag's type

The default you write selects the resolution method. Get it wrong and the
provider returns `TYPE_MISMATCH`, the middleware falls back to your default, and
you get a clean `200` with a plausible value:

```ts
// `theme` is a STRING flag in the provider
withOpenFeature({ client, flags: { theme: false } }, handler)
//                                        ^^^^^ boolean
// ctx.flags.theme === false — no error anywhere
```

`ctx.flags` holds values, not details, so a handler cannot tell a real `false`
from a fallback `false`. To check, ask the client directly and look at `reason`:

```ts
const d = await client.getBooleanDetails('theme', false)
d.reason // 'ERROR' with errorCode 'TYPE_MISMATCH' when the type is wrong
```

### 2. PostHog returns `null` instead of your default

When a flag is disabled or the caller falls outside its release conditions,
`@posthog/openfeature-node-provider@0.1.0` returns `null` rather than the default
you passed. `ctx.flags.theme` is then `null` at runtime while its type says
`string`.

That is a provider bug — OpenFeature says an unresolvable flag returns the
default — and these examples do not paper over it with `?? 'light'`, because
hiding it would make a provider bug look like our behaviour.

## What has actually been run

Verified 2026-08-21 against live Vercel Flags and PostHog projects.

| Handler          | Supabase Edge                               | Cloudflare Workers | Vercel Functions |
| ---------------- | ------------------------------------------- | ------------------ | ---------------- |
| `vercel-basic`   | ✅ `{"theme":"green","betaCheckout":false}` | ✅ same            | not run          |
| `vercel-claims`  | ✅ `{"theme":"green","user":null}`          | ✅ same            | not run          |
| `posthog-basic`  | ✅ `{"theme":"yellow_pg"}`                  | ✅ same            | not run          |
| `posthog-claims` | ✅ `{"theme":"yellow_pg","user":null}`      | ✅ same            | not run          |

The two providers return different values because they are different backends —
`green` from Vercel, `yellow_pg` from PostHog. `user: null` is correct for a
request with no `Authorization` header: `withClaims` contributes `null` rather
than rejecting.

The Vercel Functions column needs a deploy, so it is marked not run rather than
assumed.

## Before the package is published

`@supabase-labs/middleware-openfeature` is not on npm yet, so the examples cannot
depend on it by version. They also cannot use `link:` to the repo root: Vercel
and Cloudflare upload only the directory you deploy, and a symlink pointing
above that directory does not survive the upload.

Until it publishes, run `./vendor.sh` from `examples/`. It packs the package —
the exact files `npm publish` would ship — into each runtime's `vendor/`, where
`file:./vendor/middleware-openfeature.tgz` resolves inside the deploy root.
Supabase gets the same treatment through `runtimes/supabase/sync.sh`.

```bash
pnpm build          # in the repo root
./vendor.sh         # in examples/
```

When the package is published: delete `vendor.sh`, delete the `vendor/`
directories, drop the pack step from `sync.sh`, and change the dependency in
each runtime's `package.json` to a normal version range. Nothing else changes —
no handler and no entry point references the vendored path.

## Requirements

- `@supabase/server@1.6.0-beta.0` or later. It is the first release that
  exports `withClaims` and depends on `@supabase/middleware@^0.5.0`, the same
  engine range this package uses; an older server pulls a second engine copy
  into the tree and the two disagree on the `Entry` type.
- `@openfeature/server-sdk` pinned to exactly `1.18.0` wherever
  `@vercel/flags-core@1.7.1` is installed — it declares that as an exact peer.
- `@posthog/openfeature-node-provider` is `0.1.0`. Early. Its shape is sound
  (the client is injected, and it has no runtime dependency on `posthog-node`),
  but expect rough edges — see `providers/posthog.ts` for one its types have.

## Deploying

See [DEPLOY.md](./DEPLOY.md) for deploying all three to real URLs.

## Running them

Each runtime folder has its own README. In short:

```bash
# Supabase Edge Functions
cd runtimes/supabase && ./sync.sh
set -a; . ../../../smoke/.env; set +a
pnpm exec supabase start --workdir .

# Cloudflare Workers
cd runtimes/cloudflare && pnpm install
# put FLAGS and POSTHOG_API_KEY in .dev.vars
npx wrangler dev
```

## CI

CI compiles `handlers/` and `providers/` with `types: []` — no Node, Deno or
Workers globals available — so a handler that reaches for a runtime global fails
in CI rather than at deploy time. Entry points are checked by each runtime's own
toolchain. Nothing here is published: the root package ships `files: ["dist"]`.
