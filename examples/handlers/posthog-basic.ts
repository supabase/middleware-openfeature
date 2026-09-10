import type { FetchHandler } from '@supabase/middleware'
import { withOpenFeature } from '@supabase-labs/middleware-openfeature'
import type { FlagClient } from '@supabase-labs/middleware-openfeature'

/**
 * PostHog flags are either boolean or multivariate. A **multivariate** flag
 * resolves as a *string* whose value is the variant key (`yellow_pg`,
 * `green_pg`, …), so the declared default must be a string.
 *
 * Two PostHog-specific behaviours worth knowing, both covered in the README:
 *
 * - When a flag is disabled or the caller falls outside its release conditions,
 *   `@posthog/openfeature-node-provider@0.1.0` returns `null` rather than the
 *   default you passed. `ctx.flags.theme` is then `null` at runtime while its
 *   type says `string`.
 * - The provider needs `defaultDistinctId` (set in `providers/posthog.ts`) or it
 *   throws when no `targetingKey` is supplied — which is this handler's case.
 */
export const flags = { theme: 'light' }

export const createHandler = (client: FlagClient): FetchHandler =>
  withOpenFeature({ client, flags }, async (_req, ctx) =>
    Response.json({ theme: ctx.flags.theme }),
  )
