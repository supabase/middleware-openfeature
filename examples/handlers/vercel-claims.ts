import type { FetchHandler } from '@supabase/middleware'
import { withOpenFeature } from '@supabase/middleware-openfeature'
import type { FlagClient } from '@supabase/middleware-openfeature'
import { withClaims } from '@supabase/server/middleware/claims'

export const flags = { theme: 'light' }

/**
 * Targeting driven by a verified JWT.
 *
 * `withClaims` verifies the caller's Bearer token and contributes
 * `ctx.jwtClaims`, or `null` when there is no valid token. The `context`
 * callback turns that into an OpenFeature `targetingKey`, so the provider can
 * evaluate per-user rules. A request without a token still succeeds — it
 * evaluates as `anon` rather than being rejected.
 *
 * This is the **nesting** form, where `ctx` inside the config callback is typed
 * against the accumulated upstream automatically, with nothing annotated. See
 * `posthog-claims.ts` for the `pipeline` form, which needs one annotation.

 * The `FetchHandler` return annotation is load-bearing, not decoration. It is
 * the *anchor*: it supplies the contextual type that pushes the accumulated
 * context inward through the nesting, which is what types `ctx.jwtClaims` in the
 * config callback below. Without it `Base` collapses to the empty upstream and
 * this file does not compile. It also switches on key-collision detection.
 */
export const createHandler = (client: FlagClient): FetchHandler =>
  withClaims(
    withOpenFeature(
      {
        client,
        flags,
        context: (_req, ctx) => ({
          targetingKey: ctx.jwtClaims?.sub ?? 'anon',
        }),
      },
      async (_req, ctx) =>
        Response.json({
          theme: ctx.flags.theme,
          user: ctx.jwtClaims?.sub ?? null,
        }),
    ),
  )
