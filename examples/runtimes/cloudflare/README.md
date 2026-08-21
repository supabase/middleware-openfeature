# Cloudflare Workers

> **Run `../../vendor.sh` first.** Until `@supabase/middleware-openfeature` is
> published, this example depends on a packed copy at
> `vendor/middleware-openfeature.tgz`. It cannot use `link:` to the repo root:
> both Vercel and Cloudflare upload only the directory you deploy, so a symlink
> pointing above it does not survive. `vendor/` is generated and gitignored.

```bash
cd ../.. && pnpm build && ./vendor.sh && cd runtimes/cloudflare
pnpm install
printf 'FLAGS=vf_server_...\nPOSTHOG_API_KEY=phc_...\n' > .dev.vars
npx wrangler dev
curl http://127.0.0.1:8787/
```

`main` in `wrangler.toml` selects which example runs. Point it at
`src/vercel-basic.ts`, `src/vercel-claims.ts`, `src/posthog-basic.ts` or
`src/posthog-claims.ts`.

## `nodejs_compat` is required

`@openfeature/server-sdk` imports `node:events`. With the flag set, both it and
`@vercel/flags-core/openfeature` load without complaint — this was never the
blocker it is often assumed to be.

## An SDK key is required — an OIDC token will not work

Vercel Flags needs `FLAGS=vf_server_…` here. A token from `vercel env pull` is
**not** sufficient. Verified in a clean isolate:

| Credential               | Deno  | workerd   |
| ------------------------ | ----- | --------- |
| SDK key in `FLAGS`       | works | works     |
| `VERCEL_OIDC_TOKEN` only | works | **fails** |

The failure is `No flag definitions available. Bundled definitions not found.`,
which names neither the cause nor the fix.

## Secrets reach the worker as a `fetch` argument

Workers pass bindings to `fetch(req, env)`, but `@vercel/flags-core` reads
`process.env`. The Vercel entry points copy `env.FLAGS` across before building
the client. The PostHog ones need no shim, because that client takes its config
as an argument.
