# Run 2 — Supabase Edge Runtime

> **Superseded by a credentialed run on 2026-08-20.** These notes were written
> when no Vercel credential was available and two probes reported `blocked`.
> Both now pass against a real flag. The current results, and the corrections
> they forced to the design, are in
> [`docs/deno-vercel-findings.md`](../../docs/deno-vercel-findings.md).
>
> What follows is kept as the record of the credential-free run, which is still
> the outcome anyone without a Vercel account will see.

Raw results. The summary lives in [`docs/deno-vercel-findings.md`](../../docs/deno-vercel-findings.md);
this file is the unedited output it is written from.

**Date:** 2026-08-19 · **Supabase CLI:** 2.114.0 · **Credentials available:** none

## Commands

```bash
pnpm smoke:edge:vendor                              # pnpm pack -> functions/_vendor
pnpm exec supabase start --workdir smoke/edge
pnpm exec vitest run --config smoke/edge/vitest.config.ts
pnpm exec supabase stop --workdir smoke/edge
```

The function imports the **packed** package from `_vendor`, i.e. the exact
artifact `npm publish` would ship — not `src/`, and not a loose `dist/`. The
edge runtime container mounts only `supabase/functions/`, so vendoring is
mandatory, and packing is what makes the test cover published output.

## Runtime

```json
{
  "ok": true,
  "runtime": "deno supabase-edge-runtime-1.74.3 (compatible with Deno v2.1.4)"
}
```

Note this is **Deno 2.1.4**, older than the 2.7.8 used in run 1. Results were
identical across both, but a future divergence should be checked against the
edge runtime's version rather than the host's.

## vitest

```
Test Files  1 passed (1)
     Tests  4 passed (4)
```

## Full probe set

```json
{
  "runtime": "deno supabase-edge-runtime-1.74.3 (compatible with Deno v2.1.4)",
  "credentials": {
    "EDGE_CONFIG": false,
    "FLAGS": false
  },
  "probes": [
    {
      "name": "openfeature-server-sdk-loads",
      "question": "Does @openfeature/server-sdk (node:events) load in the edge sandbox?",
      "status": "ok",
      "detail": {
        "exportsOpenFeature": "object"
      }
    },
    {
      "name": "vercel-provider-loads",
      "question": "Does @vercel/flags-core/openfeature load in the edge sandbox?",
      "status": "ok",
      "detail": {
        "exportsVercelProvider": "function"
      }
    },
    {
      "name": "process-env-available",
      "question": "Is process.env readable in the edge sandbox?",
      "status": "ok",
      "detail": {
        "type": "object"
      }
    },
    {
      "name": "middleware-runs-in-edge-sandbox",
      "question": "Does @supabase/middleware-openfeature resolve flags in the edge sandbox?",
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
      "status": "blocked",
      "detail": "Neither EDGE_CONFIG nor FLAGS is set in [edge_runtime.secrets]."
    }
  ],
  "tally": {
    "ok": 4,
    "failed": 0,
    "blocked": 1
  }
}
```

## `/resolve` — a real request through the Kong gateway

```json
{ "betaCheckout": true, "theme": "light" }
```

Not just module-init: this is `withOpenFeature` running inside the edge worker,
resolving two flags against a stub `FlagClient` and contributing them at
`ctx.flags`, reached over HTTP through the gateway.

## The finding that matters

Run 1 established that `@vercel/flags-core/openfeature` needs **sys access to
"hostname" at module load** — a permission a sandbox could plausibly withhold,
which would make the provider unusable on Edge Functions no matter what else
worked.

**The Supabase Edge Runtime grants it.** `vercel-provider-loads` is `ok`.

Combined with the other three probes, everything on the Supabase side works. The
only unproven step is initializing `VercelProvider` against a real Edge Config,
which needs a Vercel account and nothing else.

## What is still blocked

`vercel-provider-initializes` — needs `EDGE_CONFIG` or `FLAGS` set under
`[edge_runtime.secrets]` in `smoke/edge/supabase/config.toml`, plus a
`SMOKE_FLAG_KEY` naming a flag in that config. Add them and re-run; no code
changes are needed.

## Notes for the next runner

- Ports are offset to **54341** (API) / 54342 (db) so this stack coexists with
  the CLI defaults and with `@supabase/server`'s e2e stack on 54331.
- `verify_jwt = false` on the function, so the gateway's JWT pre-check does not
  answer before the middleware does.
- `smoke/edge/vendor.sh` carries the same JSDoc-specifier workaround as
  `@supabase/server`'s `e2e/scripts/vendor-pack.sh` — Supabase CLI >= 2.110
  scans import specifiers out of JSDoc comments and aborts `supabase start` on
  ones that do not resolve. It did not fire for this package's published JSDoc
  on CLI 2.114.0, but the guard is cheap and the failure mode is opaque.
