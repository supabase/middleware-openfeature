# Does Vercel Flags work on Deno and Supabase Edge Functions?

**Question:** does `VercelProvider` from `@vercel/flags-core/openfeature` resolve
a real flag on the Deno runtime that Supabase Edge Functions use, when driven
through `@supabase/middleware-openfeature`?

**Date:** 2026-08-19 · **Answer in one line:** everything on the Supabase and
Deno side works — including the one permission that could have made it
impossible — and the only unproven step is initializing the provider against a
real Edge Config, which needs a Vercel account and no code changes.

## What was tested

|                                    |                                                               |
| ---------------------------------- | ------------------------------------------------------------- |
| Deno (run 1, host)                 | 2.7.8                                                         |
| Deno (run 2, edge)                 | supabase-edge-runtime-1.74.3, compatible with Deno 2.1.4      |
| Supabase CLI                       | 2.114.0                                                       |
| `@vercel/flags-core`               | 1.7.1                                                         |
| `@openfeature/server-sdk`          | 1.18.0 — pinned, see "the peer pin" below                     |
| `@openfeature/core`                | 1.12.0                                                        |
| `@supabase/middleware`             | 0.3.0                                                         |
| `@supabase/middleware-openfeature` | 0.1.0, packed with `pnpm pack` (run 2 uses published output)  |
| Credential                         | **none** — no Edge Config, no `FLAGS`, no `VERCEL_OIDC_TOKEN` |

Both runs are structured as independent probes rather than one pass/fail,
because the credential-gated half and the runtime half fail for entirely
different reasons — and the runtime half, which is the part Supabase controls,
turns out to be answerable with no Vercel account at all.

## Results

| Probe                                                   | Run 1 — `deno run` | Run 2 — Edge Runtime               |
| ------------------------------------------------------- | ------------------ | ---------------------------------- |
| `@openfeature/server-sdk` loads (imports `node:events`) | ✅                 | ✅                                 |
| `@vercel/flags-core/openfeature` loads                  | ✅                 | ✅                                 |
| `process.env` readable (needed by `@vercel/oidc`)       | ✅                 | ✅                                 |
| `withOpenFeature` resolves flags end to end             | ✅                 | ✅ (over HTTP through the gateway) |
| `VercelProvider` initializes against a real Edge Config | ⛔ blocked         | ⛔ blocked                         |

Raw output: [`smoke/deno/README.md`](../smoke/deno/README.md),
[`smoke/edge/README.md`](../smoke/edge/README.md).

## The finding that matters

Design §7 listed four risks. Three did not fire. The one real gate was **not on
that list**, and it was found by run 1 and cleared by run 2.

`@vercel/flags-core/openfeature` requires **sys access to `"hostname"` at module
load** — before any flag is resolved, before the provider is even constructed.
Dropping `--allow-sys` on the host produces:

```
NotCapable: Requires sys access to "hostname", run again with the --allow-sys flag
```

This is the kind of thing that makes an integration impossible rather than
awkward: a sandbox that withholds it cannot import the provider at all, and no
amount of configuration works around it.

**The Supabase Edge Runtime grants it.** The provider module loads in the edge
sandbox, verified on `supabase-edge-runtime-1.74.3`.

## What each of design §7's risks turned out to be

| Risk (design §7)                                                   | Outcome                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:events` via `@openfeature/server-sdk` reaching Deno          | **Non-issue.** Loads on both runtimes. §7 listed this first; it is the least of the four.                                                   |
| `process.env` inside the Supabase edge sandbox                     | **Available.** `typeof process.env === 'object'` in the edge worker.                                                                        |
| Filesystem token cache needing `--allow-read`                      | **Did not fire.** All four passing probes run without `--allow-read`. May yet appear once a real OIDC token exercises the cache write path. |
| OIDC off-Vercel — no ambient `VERCEL_OIDC_TOKEN`                   | **Untested, and now the only open question.** Needs an account.                                                                             |
| _(not on §7's list)_ `--allow-sys` for `"hostname"` at module load | **The actual gate — and it is granted.** See above.                                                                                         |

One prediction from static analysis held: `jose@5.2.1`, a direct dependency of
`@vercel/flags-core`, ships a `deno` export condition resolving to a WebCrypto
build with no `node:` imports, so the Vercel chain stays `node:`-free on Deno.

## The peer pin

`@vercel/flags-core@1.7.1` declares `@openfeature/server-sdk` as an **exact**
peer — `"@openfeature/server-sdk": "1.18.0"`, not a range. Installing it
alongside 1.23.0 fails with `ERESOLVE / Conflicting peer dependency`. Anyone
combining the two must pin 1.18.0.

This is not a problem for `@supabase/middleware-openfeature`, which depends on
neither: it accepts the client structurally and imports types only from
`@openfeature/core`. The pin is the consumer's to manage — which is an argument
_for_ the structural approach rather than against it. The same package works
against 1.18.0 (both smoke runs) and 1.23.0 (the type tests and the TypeScript
floor fixture) with no conditional code.

## Design §2.7's version table is stale

§2.7 was built from a static read of `@vercel/flags-core@1.7.1`'s bundle. Deno's
own resolution pulled newer transitive versions:

| Package             | §2.7 says | Actually resolved                 |
| ------------------- | --------- | --------------------------------- |
| `@vercel/functions` | 3.4.3     | **3.9.3**                         |
| `@vercel/oidc`      | 3.5.0     | 3.5.0 **and** 3.8.4, both present |

Also present and absent from §2.7's table: `zod@4.1.11`, `@vercel/cli-config@0.2.3`,
`@vercel/cli-exec@1.0.1`. Any §2.7 conclusion about `node:` imports or
`process.env` reads should be re-checked against these versions before it is
quoted in the pitch. The runtime results above supersede it either way — they
were measured, not inferred.

## What this means for the pitch

A partner wanting Vercel Flags on Supabase Edge Functions today needs:

1. An Edge Config (or hosted `FLAGS`) and a way to get its connection string
   into the function — `[edge_runtime.secrets]` locally, function secrets when
   deployed.
2. `@openfeature/server-sdk` pinned to exactly `1.18.0`.
3. Nothing else. No polyfills, no compatibility flags, no forks. The runtime
   requirements are met.

The one thing still to prove is OIDC off-Vercel. Design §7 anticipated that
`vercel env pull` writes a short-lived token, so a CI-persistent test likely
needs a static credential path — that remains the expected sticking point, and
it is an _account_ problem rather than a _runtime_ problem.

**What would make it turnkey:** a documented static-credential path for
`@vercel/oidc` outside Vercel. Everything else already works.

## Reproducing

```bash
pnpm install
cp smoke/.env.example smoke/.env    # fill in credentials to unblock the last probe

pnpm smoke:deno                      # run 1

pnpm smoke:edge:vendor
pnpm exec supabase start --workdir smoke/edge
pnpm exec vitest run --config smoke/edge/vitest.config.ts
pnpm exec supabase stop --workdir smoke/edge
```

Both runs report `blocked` rather than failing when credentials are absent, so
they are runnable by anyone. Adding credentials requires no code changes.
