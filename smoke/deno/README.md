# Run 1 — plain `deno run`

Raw results. The summary lives in [`docs/deno-vercel-findings.md`](../../docs/deno-vercel-findings.md);
this file is the unedited output it is written from.

**Date:** 2026-08-19 · **Deno:** 2.7.8 · **Credentials available:** none

## Command

```bash
pnpm smoke:deno
# = pnpm build && deno run --allow-env --allow-net --allow-read --allow-sys \
#     --allow-ffi --config smoke/deno/deno.json smoke/deno/main.ts
```

## Output

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
  "credentials": {
    "EDGE_CONFIG": false,
    "FLAGS": false,
    "VERCEL_OIDC_TOKEN": false,
    "SMOKE_FLAG_KEY": false
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
      "question": "Does @supabase/middleware-openfeature itself resolve flags on Deno?",
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
      "detail": "Neither EDGE_CONFIG nor FLAGS is set. See smoke/.env.example."
    },
    {
      "name": "resolves-real-flag",
      "question": "Does a real Vercel flag resolve through withOpenFeature on Deno?",
      "status": "blocked",
      "detail": "SMOKE_FLAG_KEY is not set."
    }
  ],
  "tally": {
    "ok": 4,
    "failed": 0,
    "blocked": 2
  }
}
```

## Permission matrix

Which Deno permissions are actually required, measured by re-running with each
dropped. Relevant because the design document predicted the filesystem token cache
(`LOCALAPPDATA` / `XDG_DATA_HOME`) would need `--allow-read`, and Supabase Edge
Functions may not grant it.

| Permissions                                        | Probes passing |
| -------------------------------------------------- | -------------- |
| `--allow-env --allow-net --allow-read --allow-sys` | 4              |
| `--allow-env --allow-net --allow-sys` (no read)    | 4              |
| `--allow-env --allow-net` (no read, no sys)        | 3              |
| `--allow-env` only                                 | 3              |

**`--allow-read` is not required.** The third predicted risk did not fire — at least not
without a real OIDC token exercising the cache write path.

**`--allow-sys` IS required, and earlier than expected.** Dropping it fails
`@vercel/flags-core/openfeature` at **module load**, before any flag is
resolved:

```
NotCapable: Requires sys access to "hostname", run again with the --allow-sys flag
```

The design document does not list this risk. It is the most consequential finding of run 1
for the Supabase Edge Functions question, because it gates the import itself
rather than a resolution call.

## Transitive versions Deno actually resolved

The design document's dependency table was built from a static read of `@vercel/flags-core@1.7.1`'s
bundle. Deno's own resolution pulled newer transitive versions:

| Package             | Design table | Resolved here                      |
| ------------------- | ------------ | ---------------------------------- |
| `@vercel/functions` | 3.4.3        | **3.9.3**                          |
| `@vercel/oidc`      | 3.5.0        | 3.5.0 **and** 3.8.4 (both present) |

Also present, and absent from that table: `zod@4.1.11`, `@vercel/cli-config@0.2.3`,
`@vercel/cli-exec@1.0.1`. Any conclusion it drew about `node:` imports or
`process.env` reads should be re-checked against these versions before it is
quoted in the pitch.

## What is still blocked

Two probes need a Vercel account and are unanswerable here:

- `vercel-provider-initializes` — needs `EDGE_CONFIG` or `FLAGS`
- `resolves-real-flag` — needs `SMOKE_FLAG_KEY` naming a flag in that config

Fill in `smoke/.env` from `smoke/.env.example` and re-run. Note that
`smoke:deno` does not currently load `smoke/.env`; export the variables in the
shell, or add `--env-file=smoke/.env` to the script once the file exists.
