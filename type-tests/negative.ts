/**
 * Cases that MUST NOT compile.
 *
 * Excluded from `tsconfig.json` on purpose — `pnpm typecheck` would fail on it.
 * `pnpm typecheck:negative` compiles this file with the config next door and
 * asserts each `@expect-error` marker below is matched by a real diagnostic,
 * and that no unexpected diagnostic appears.
 *
 * Marker format: `// @expect-error <TSCODE> <substring of the message>`
 */

import { pipeline } from '@supabase/middleware'
import type { FetchHandler } from '@supabase/middleware'

import { withOpenFeature } from '../src/index.js'
import { client, withClaims } from './fixtures.js'

// A5 — proves the nesting form's `ctx` is genuinely typed and not silently
// `any`. A bogus key must be rejected, and the message must print the real
// accumulated type.
// @expect-error TS2339 Property 'nope' does not exist on type
withClaims(
  withOpenFeature(
    {
      client,
      flags: { a: false },
      context: (_r, ctx) => ({ targetingKey: ctx.nope }),
    },
    async () => new Response(),
  ),
) satisfies FetchHandler

// A6 — `jwtClaims` is `| null`, so an unguarded `.sub` must be rejected. This
// is the second half of proving the nesting form's typing is real.
// @expect-error TS18047 is possibly 'null'
withClaims(
  withOpenFeature(
    {
      client,
      flags: { a: false },
      context: (_r, ctx) => ({ targetingKey: ctx.jwtClaims.sub }),
    },
    async () => new Response(),
  ),
) satisfies FetchHandler

// A7 — pipeline form, config callback reads upstream WITHOUT the annotation.
// This is the documented limit, pinned as a test so the docs and the
// compiler cannot drift apart. NOTE: only the callback fails — the handler in
// this same expression types fine, which is what A8 in positive.ts proves.
// @expect-error TS2339 Property 'jwtClaims' does not exist on type 'object'
pipeline(
  [
    withClaims(),
    withOpenFeature({
      client,
      flags: { a: false },
      context: (_r, ctx) => ({ targetingKey: ctx.jwtClaims?.sub }),
    }),
  ],
  async (_req, ctx) => Response.json({ a: ctx.flags.a }),
) satisfies FetchHandler

// A10 — a bogus key in the pipeline HANDLER must error, printing the full
// accumulated type. This is what proves A8's typing is real accumulation and
// not `any`.
// @expect-error TS2339 Property 'nope' does not exist on type
pipeline(
  [withClaims(), withOpenFeature({ client, flags: { a: false } })],
  async (_req, ctx) => Response.json({ nope: ctx.nope }),
) satisfies FetchHandler

// A11 — a key collision must be reported against THIS call, naming the key.
// `NoConflict` on the handler parameter is what makes the message readable.
// TS2769 with the sentinel in the per-overload breakdown, matching what
// `Conflict`'s docblock describes. The code depends on how many signatures can
// accept a handler: with only the cascade overload this reported TS2345, a
// plain argument mismatch; adding the propagation overload (A13) made it two,
// and the diagnostic became an overload-set failure. Either way the sentinel
// reaches the reader and names the colliding key, which is the point of siting
// it on the parameter rather than on the `Base` constraint.
// @expect-error TS2769 middleware-conflict: key 'flags' is already present on the upstream context
withOpenFeature(
  { client, flags: { a: false } },
  withOpenFeature({ client, flags: { b: false } }, async () => new Response()),
) satisfies FetchHandler

import { withSupabase } from '@supabase/server'

const serverEnv = {
  url: 'https://test.supabase.co',
  publishableKeys: { default: 'sb_publishable_xyz' },
  secretKeys: { default: 'sb_secret_xyz' },
  jwks: null,
}

// NS1 — the composite keeps its plumbing internal: a third party cannot read
// `supabaseAuth` off the context `withSupabase` hands down.
// @expect-error TS2339 Property 'supabaseAuth' does not exist on type
withSupabase(
  { auth: 'user', env: serverEnv },
  withOpenFeature(
    {
      client,
      flags: { a: false },
      context: (_r, ctx) => ({ targetingKey: ctx.supabaseAuth }),
    },
    async () => new Response(),
  ),
) satisfies FetchHandler

// NS2 — pipeline form against the real entry: reading the composite's claims
// in the callback without the annotation is the same documented limit as A7.
// @expect-error TS2339 Property 'jwtClaims' does not exist on type 'object'
pipeline(
  [
    withSupabase({ auth: 'user', env: serverEnv }),
    withOpenFeature({
      client,
      flags: { a: false },
      context: (_r, ctx) => ({ targetingKey: ctx.jwtClaims?.sub }),
    }),
  ],
  async (_req, ctx) => Response.json({ a: ctx.flags.a }),
) satisfies FetchHandler

// NS3 — nested under `withSupabase` with neither an annotation nor an explicit
// `Database`, the composite context does not reach the callback (S2 and S2b in
// positive.ts are the two spellings that work). Pinned so a server release
// that carries `Base` through shows up here as an unexpected pass.
// @expect-error TS2339 Property 'authMode' does not exist on type 'object'
withSupabase(
  { auth: 'user', env: serverEnv },
  withOpenFeature(
    {
      client,
      flags: { a: false },
      context: (_r, ctx) => ({ targetingKey: ctx.authMode }),
    },
    async (_req, ctx) => Response.json({ a: ctx.flags.a }),
  ),
) satisfies FetchHandler
