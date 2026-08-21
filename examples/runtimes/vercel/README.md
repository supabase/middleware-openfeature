# Vercel Functions

```bash
pnpm install
vercel dev          # or: vercel deploy
```

Routes are `api/vercel-basic`, `api/vercel-claims`, `api/posthog-basic`,
`api/posthog-claims`.

## Vercel Flags needs no credential here

This is the **only** runtime where that is true. The platform injects
`VERCEL_OIDC_TOKEN` into its own functions, so `new VercelProvider()` works with
no configuration. That is why Vercel's quickstart never mentions SDK keys — and
why the same code needs one everywhere else.

PostHog still needs `POSTHOG_API_KEY` (and optionally `POSTHOG_HOST`) as project
environment variables.

## Runtime

`vercel.json` pins the Node runtime, because it needs no extra configuration.
Nothing in the handlers depends on that choice — PostHog is imported from
`posthog-node/edge` on every runtime, so the Edge runtime would work equally
well.

## Not yet verified

Unlike the Supabase and Cloudflare examples, these have not been run against a
live deployment — only typechecked. See the verification table in
[`../../README.md`](../../README.md).
