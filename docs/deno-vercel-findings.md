# Does Vercel Flags work on Deno and Supabase Edge Functions?

**Question:** does `VercelProvider` from `@vercel/flags-core/openfeature` resolve
a real flag on the Deno runtime that Supabase Edge Functions use, when driven
through `@supabase-labs/middleware-openfeature`?

**Date:** 2026-08-20 · **Answer: yes, on both runtimes, against a real flag.**

Every probe passed on both. A flag named `theme` in a real Vercel project
resolved to its dashboard value, `"yellow"`, with `reason: STATIC`, and arrived
at `ctx.flags.theme` unchanged.

## What was tested

|                                         |                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Run 1                                   | plain `deno run`, Deno 2.7.8                                                     |
| Run 2                                   | Supabase Edge Runtime 1.74.3 (Deno 2.1.4), local stack, through the Kong gateway |
| Supabase CLI                            | 2.114.0                                                                          |
| `@vercel/flags-core`                    | 1.7.1                                                                            |
| `@openfeature/server-sdk`               | 1.18.0 — pinned, see "the forced peer version" below                             |
| `@openfeature/core`                     | 1.12.0                                                                           |
| `@supabase/middleware`                  | 0.3.0                                                                            |
| `@supabase-labs/middleware-openfeature` | 0.1.0, packed with `pnpm pack` for run 2                                         |
| Credential                              | `VERCEL_OIDC_TOKEN` from `vercel env pull`                                       |

Run 2 imports the package after `pnpm pack`, so it exercises the exact files
`npm publish` would ship.

## Results

| Probe                                                      | Run 1 — Deno                        | Run 2 — Edge Runtime                |
| ---------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| `@openfeature/server-sdk` loads (it imports `node:events`) | pass                                | pass                                |
| `@vercel/flags-core/openfeature` loads                     | pass                                | pass                                |
| `process.env` readable (needed by `@vercel/oidc`)          | pass                                | pass                                |
| `withOpenFeature` resolves flags (stub client)             | pass                                | pass                                |
| `VercelProvider` initializes against the real service      | **pass**                            | **pass**                            |
| The flag answers, rather than falling back                 | **pass** — `"yellow"`, `STATIC`     | **pass** — `"yellow"`, `STATIC`     |
| The same flag through `withOpenFeature`                    | **pass**, matches direct evaluation | **pass**, matches direct evaluation |

7 ok, 0 failed, 0 blocked on both.

## Corrections to the original design

Three things the design document got wrong. All were found by running it.

### 1. It is `FLAGS`, not `EDGE_CONFIG`

The design said the provider reads `EDGE_CONFIG`. It does not. The default
(non-Next.js) entry point — the one Deno and Edge Functions resolve to — carries
this comment in its own published source:

```js
/**
 * A lazily-initialized default flags client.
 * - relies on process.env.FLAGS
 * - does not use process.env.EDGE_CONFIG
 */
```

Setting `EDGE_CONFIG` does nothing on this path.

### 2. An SDK key removes the OIDC problem entirely

The design treated "OIDC off-Vercel" as the main open risk. It is a fallback, not
a requirement:

```js
async resolveToken() {
  if (this.sdkKey) return this.sdkKey
  return await getOidcToken()   // only reached when FLAGS is unset
}
```

`FLAGS` accepts a bare key matching `/^vf_(server|client)_/` or a connection
string of the form `flags:sdkKey=vf_server_...`. With one set, OIDC is never
consulted for authentication.

### 3. `FLAGS_SECRET` is not a credential

`vercel env pull` on a project with flags configured returns `FLAGS_SECRET` and
`VERCEL_OIDC_TOKEN`, and **neither is an SDK key**. `FLAGS_SECRET` is the Flags
SDK's signing secret for the Flags Explorer and precompute; it has no role in
evaluation. An SDK key has to be taken from **Flags → SDK Keys** in the
dashboard.

This run used the OIDC token, which worked on both runtimes.

## The trap worth knowing about

The first credentialed run reported this:

```
resolves-real-flag         ok      body: { "theme": false }
flag-resolves-with-reason  FAILED  reason: ERROR, errorCode: TYPE_MISMATCH
                                   errorMessage: 'Expected boolean value for flag "theme"'
```

A clean 200 with a plausible-looking value — and completely wrong. `theme` is a
**string** flag; the probe asked for a boolean; the middleware caught the error
and substituted the declared default, exactly as designed.

**This is a property of the design, not a defect.** `ctx.flags` holds values
only, because Rule 1 allows one `ctx` key. So a handler cannot tell "the provider
returned false" from "the provider errored and you got your default". If a flag
is declared with the wrong type in the `flags` map, **nothing reports it at
runtime**.

Two consequences:

- Any test of a real provider must assert on `reason`, not on the value. The
  probes now detect the flag's type by trying boolean, string, number and object
  in turn, and treat `reason: 'ERROR'` as a failure.
- Consumers should be told the declared default's type must match the flag's
  type in the provider. This is now a caveat in the README.

## The permission finding

Run 1 established that `@vercel/flags-core/openfeature` needs **sys access to
`"hostname"` at module load** — before any flag is resolved, before the provider
is constructed. Without `--allow-sys`:

```
NotCapable: Requires sys access to "hostname", run again with the --allow-sys flag
```

A sandbox that withholds it could not import the provider at all. **The Supabase
Edge Runtime grants it.**

`--allow-read` is **not** required, contrary to the design's prediction about a
filesystem token cache.

## OIDC token lifetime — the one real limitation

The token issued by `vercel env pull` lasts **12 hours**. That is fine for a
manual run and unusable for CI.

Worse for the edge case: `@vercel/oidc` ships an edge build
(`index-edge-light.js`) whose `getVercelOidcToken` **has no refresh path** — it
returns the token as-is. The Node build refreshes by reading the Vercel CLI's
stored credentials from disk (`LOCALAPPDATA` / `XDG_DATA_HOME`) and calling
`api.vercel.com`, and the edge sandbox can do neither.

So an expired token inside an Edge Function is a hard failure with no recovery.
**Use an SDK key for anything repeatable.**

## The forced peer version

`@vercel/flags-core@1.7.1` declares:

```json
"peerDependencies": { "@openfeature/server-sdk": "1.18.0", "next": "*" }
```

An exact version, not a range. Installing it beside `1.23.0` fails with
`Conflicting peer dependency`.

This is not a problem for `@supabase-labs/middleware-openfeature`, which depends on
neither: it accepts the client structurally and imports types only from
`@openfeature/core`. The same build ran against 1.18.0 here and against 1.23.0 in
the type tests and the TypeScript floor fixture, with no conditional code. The
pin is the consumer's to manage — an argument _for_ the structural approach.

## What a partner needs today

1. A flag in a Vercel project.
2. A credential: an SDK key in `FLAGS` (recommended), or `VERCEL_OIDC_TOKEN`
   while it lasts. Delivered to the function as a secret —
   `[edge_runtime.secrets]` locally, function secrets when deployed.
3. `@openfeature/server-sdk` pinned to exactly `1.18.0`.
4. A declared default whose type matches the flag's type.

No polyfills, no compatibility flags, no forks.

## Raw output

### Run 1 — plain `deno run`

```json
{
  "runtime": "deno 2.7.8",
  "v8": "14.7.173.7-rusty",
  "versions": {
    "@openfeature/server-sdk": "1.18.0",
    "@openfeature/core": "1.12.0",
    "@vercel/flags-core": "1.7.1",
    "@supabase/middleware": "0.3.0"
  },
  "authPath": "oidc (VERCEL_OIDC_TOKEN)",
  "credentials": {
    "EDGE_CONFIG": false,
    "FLAGS": false,
    "VERCEL_OIDC_TOKEN": true,
    "SMOKE_FLAG_KEY": true
  },
  "probes": [
    {
      "name": "openfeature-server-sdk-loads",
      "question": "Does @openfeature/server-sdk (which imports node:events) load on Deno?",
      "status": "ok",
      "detail": {
        "exportsOpenFeature": "object"
      }
    },
    {
      "name": "vercel-provider-loads",
      "question": "Does @vercel/flags-core/openfeature load on Deno?",
      "status": "ok",
      "detail": {
        "exportsVercelProvider": "function"
      }
    },
    {
      "name": "process-env-available",
      "question": "Is process.env readable, as @vercel/oidc requires?",
      "status": "ok",
      "detail": {
        "type": "object"
      }
    },
    {
      "name": "middleware-runs-on-deno",
      "question": "Does @supabase-labs/middleware-openfeature itself resolve flags on Deno?",
      "status": "ok",
      "detail": {
        "status": 200,
        "body": {
          "betaCheckout": true,
          "theme": "light"
        }
      }
    },
    {
      "name": "vercel-provider-initializes",
      "question": "Does VercelProvider initialize against a real Edge Config?",
      "status": "ok"
    },
    {
      "name": "flag-resolves-with-reason",
      "question": "Does the provider actually answer, rather than falling back?",
      "status": "ok",
      "detail": {
        "flagKey": "theme",
        "detectedType": "string",
        "value": "green",
        "reason": "STATIC",
        "interpretation": "provider answered; flag is a string flag"
      }
    },
    {
      "name": "resolves-real-flag",
      "question": "Does a real Vercel flag resolve through withOpenFeature on Deno?",
      "status": "ok",
      "detail": {
        "status": 200,
        "body": {
          "theme": "green"
        },
        "matchesDirectEvaluation": true,
        "note": "ctx.flags carries the same value the provider returned directly"
      }
    }
  ],
  "tally": {
    "ok": 7,
    "failed": 0,
    "blocked": 0
  }
}
```

### Run 2 — Supabase Edge Runtime

```json
{
  "runtime": "deno supabase-edge-runtime-1.74.3 (compatible with Deno v2.1.4)",
  "credentials": { "EDGE_CONFIG": false, "FLAGS": false },
  "probes": [
    {
      "name": "openfeature-server-sdk-loads",
      "question": "Does @openfeature/server-sdk (node:events) load in the edge sandbox?",
      "status": "ok",
      "detail": { "exportsOpenFeature": "object" }
    },
    {
      "name": "vercel-provider-loads",
      "question": "Does @vercel/flags-core/openfeature load in the edge sandbox?",
      "status": "ok",
      "detail": { "exportsVercelProvider": "function" }
    },
    {
      "name": "process-env-available",
      "question": "Is process.env readable in the edge sandbox?",
      "status": "ok",
      "detail": { "type": "object" }
    },
    {
      "name": "middleware-runs-in-edge-sandbox",
      "question": "Does @supabase-labs/middleware-openfeature resolve flags in the edge sandbox?",
      "status": "ok",
      "detail": {
        "status": 200,
        "body": { "betaCheckout": true, "theme": "light" }
      }
    },
    {
      "name": "vercel-provider-initializes",
      "question": "Does VercelProvider initialize against a real Edge Config?",
      "status": "ok"
    },
    {
      "name": "flag-resolves-with-reason",
      "question": "Does the provider actually answer in the edge sandbox?",
      "status": "ok",
      "detail": {
        "flagKey": "theme",
        "detectedType": "string",
        "value": "yellow",
        "reason": "STATIC"
      }
    },
    {
      "name": "resolves-real-flag",
      "question": "Does a real Vercel flag resolve through withOpenFeature in the edge sandbox?",
      "status": "ok",
      "detail": {
        "body": { "theme": "yellow" },
        "matchesDirectEvaluation": true
      }
    }
  ],
  "tally": { "ok": 7, "failed": 0, "blocked": 0 }
}
```

## Reproducing

```bash
pnpm install
cp smoke/.env.example smoke/.env     # add FLAGS or VERCEL_OIDC_TOKEN, and SMOKE_FLAG_KEY

pnpm smoke:deno                      # run 1

set -a; . ./smoke/.env; set +a       # config.toml reads these via env()
pnpm smoke:edge:vendor
pnpm exec supabase start --workdir smoke/edge
pnpm exec vitest run --config smoke/edge/vitest.config.ts
pnpm exec supabase stop --workdir smoke/edge
```

Both runs report `blocked` rather than failing when credentials are absent, so
they are runnable by anyone without a Vercel account — they just stop short of
the last two probes.
