# Deploying the examples

Three deployments, one per runtime, each exposing all four examples. The point is
a URL anyone can `curl` to see the same handlers running on three platforms.

**Run this first, in every case.** The package is not published yet, so each
runtime needs a packed copy:

```bash
pnpm build            # repo root
cd examples && ./vendor.sh
```

---

## 1. Cloudflare Workers

One worker, four routes, via `src/index.ts`.

```bash
cd examples/runtimes/cloudflare
pnpm install
npx wrangler login

# Secrets. .dev.vars is LOCAL ONLY — a deployed worker cannot see it.
npx wrangler secret put FLAGS             # vf_server_…
npx wrangler secret put POSTHOG_API_KEY   # phc_…
npx wrangler secret put POSTHOG_HOST      # https://us.i.posthog.com

npx wrangler deploy
```

Then:

```bash
curl https://middleware-openfeature-examples.<your-subdomain>.workers.dev/vercel-basic
curl https://middleware-openfeature-examples.<your-subdomain>.workers.dev/posthog-basic
```

**`FLAGS` must be an SDK key.** An OIDC token does not work on workerd — verified
in a clean isolate, it fails with `No flag definitions available`.

---

## 2. Vercel Functions

Four routes, one per file under `api/`. Vercel wires them up automatically.

```bash
cd examples/runtimes/vercel
pnpm install
vercel link
```

**Read this before setting env vars — it decides whether you need any.**

Vercel Flags authenticates with the OIDC token Vercel injects into _that
project_. So:

- **Deploying into the project that owns the `theme` flag** → set nothing for
  Vercel Flags. This is the case worth demonstrating, because it shows the
  zero-config path.
- **Deploying into a new project** → its OIDC token belongs to the new project,
  which has no flags, and evaluation returns defaults. Set `FLAGS` to the SDK key
  of the flag-owning project instead.

PostHog needs its key either way:

```bash
vercel env add POSTHOG_API_KEY production   # phc_…
vercel env add POSTHOG_HOST production      # https://us.i.posthog.com
# only if deploying into a project that does not own the flag:
vercel env add FLAGS production             # vf_server_…

vercel deploy --prod
```

Then:

```bash
curl https://<deployment>.vercel.app/api/vercel-basic
curl https://<deployment>.vercel.app/api/posthog-basic
```

---

## 3. Supabase Edge Functions

```bash
cd examples/runtimes/supabase
./sync.sh                       # required: the container mounts only functions/

supabase login
supabase link --project-ref <your-project-ref>

supabase secrets set FLAGS=vf_server_… \
                     POSTHOG_API_KEY=phc_… \
                     POSTHOG_HOST=https://us.i.posthog.com

for f in vercel-basic vercel-claims posthog-basic posthog-claims; do
  supabase functions deploy "$f" --no-verify-jwt
done
```

`--no-verify-jwt` is needed because the `verify_jwt = false` in
`supabase/config.toml` applies to the **local** stack only. Without it the
gateway rejects unauthenticated requests before the middleware runs, and
`withClaims` never gets to decide.

Then:

```bash
curl https://<project-ref>.supabase.co/functions/v1/vercel-basic
curl https://<project-ref>.supabase.co/functions/v1/posthog-basic
```

---

## What you should see

The same four responses on all three platforms:

| Route            | Response                                 |
| ---------------- | ---------------------------------------- |
| `vercel-basic`   | `{"theme":"green","betaCheckout":false}` |
| `vercel-claims`  | `{"theme":"green","user":null}`          |
| `posthog-basic`  | `{"theme":"yellow_pg"}`                  |
| `posthog-claims` | `{"theme":"yellow_pg","user":null}`      |

Two things make this a real demonstration rather than a coincidence:

- The two providers return **different** values (`green` from Vercel,
  `yellow_pg` from PostHog). If both fell back to their declared defaults you
  would see `light` in every response.
- `user` is `null` only because no `Authorization` header was sent. Send a Bearer
  token and it becomes the token's `sub` — `withClaims` contributes `null`
  rather than rejecting, which is why an unauthenticated request still succeeds.

To exercise the claims path:

```bash
curl -H "Authorization: Bearer $TOKEN" https://…/vercel-claims
```

That needs `SUPABASE_JWKS_URL` set wherever you deployed, so `withClaims` can
verify the token.

## After publishing

Every deployment above stops needing `vendor.sh`: delete it, delete the
`vendor/` directories, drop the pack step from `sync.sh`, and change the
dependency in each runtime's `package.json` to a version range. No handler or
entry point changes.
