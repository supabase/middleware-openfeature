import { pipeline } from '@supabase/middleware'
import type { FetchHandler } from '@supabase/middleware'
import { withOpenFeature } from '@supabase-labs/middleware-openfeature'
import type { FlagClient } from '@supabase-labs/middleware-openfeature'
import { withClaims } from '@supabase/server/middleware/claims'
import type { JWTClaims } from '@supabase/server'

export const flags = { theme: 'light' }

/**
 * The same targeting as `vercel-claims.ts`, composed with `pipeline` instead of
 * nesting. With a multivariate PostHog flag the targeting key decides which
 * variant a caller gets, so two users can see different values.
 *
 * One difference from the nesting form, and it is the only one: a config
 * callback that reads upstream context needs an explicit parameter annotation
 * here. `withOpenFeature({…})` is a complete expression that TypeScript checks
 * before `pipeline` sees the array, so array-position information cannot flow
 * backwards into it. Everything else — ordering, prerequisites, and the
 * handler's own `ctx` — is typed with nothing annotated.

 * The `FetchHandler` return annotation is load-bearing, not decoration. It is
 * the *anchor*: it supplies the contextual type that pushes the accumulated
 * context inward through the nesting, which is what types `ctx.jwtClaims` in the
 * config callback below. Without it `Base` collapses to the empty upstream and
 * this file does not compile. It also switches on key-collision detection.
 */
export const createHandler = (client: FlagClient): FetchHandler =>
  pipeline(
    [
      withClaims(),
      withOpenFeature({
        client,
        flags,
        //                       ↓ required in the pipeline form, not in nesting
        context: (_req, ctx: { jwtClaims: JWTClaims | null }) => ({
          targetingKey: ctx.jwtClaims?.sub ?? 'anon',
        }),
      }),
    ],
    async (_req, ctx) =>
      Response.json({
        theme: ctx.flags.theme,
        user: ctx.jwtClaims?.sub ?? null,
      }),
  )
