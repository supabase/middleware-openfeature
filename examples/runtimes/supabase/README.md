# Supabase Edge Functions

```bash
./sync.sh                                  # required, see below
set -a; . ../../../smoke/.env; set +a      # FLAGS, POSTHOG_API_KEY, POSTHOG_HOST
pnpm exec supabase start --workdir .

curl http://127.0.0.1:54351/functions/v1/vercel-basic
curl http://127.0.0.1:54351/functions/v1/posthog-basic

pnpm exec supabase stop --workdir .
```

Ports are offset to **54351** so this stack runs alongside the CLI defaults
(54321), `@supabase/server`'s e2e stack (54331) and this repo's smoke stack
(54341).

## Why `sync.sh` exists

The edge runtime container mounts **only** `supabase/functions/`. A function
cannot import `../../handlers/`. `sync.sh` copies `handlers/` and `providers/`
into `supabase/functions/_shared/`, and packs the middleware there too — the
exact files `npm publish` would ship. That directory is generated and gitignored.

Re-run `sync.sh` after changing any handler or provider.

## Credentials

Vercel Flags needs an **SDK key** in `FLAGS`. Delivered through
`[edge_runtime.secrets]` in `supabase/config.toml`, which reads from the shell
via `env(...)` so nothing secret is committed.

## One trap worth knowing

**The providers use static imports, deliberately.** With `await import()` inside
`providers/vercel.ts`, this runtime fails with:

```
@vercel/flags-core: No flag definitions available. Bundled definitions not found.
```

That is the _same_ error you get with no credential at all, so it sends you
hunting for a credential problem that does not exist. The identical dynamic
import works on Node and on Cloudflare Workers. Keep the imports static.
