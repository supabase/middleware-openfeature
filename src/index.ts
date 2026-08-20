/**
 * `@supabase/middleware-openfeature` — typed OpenFeature flag resolution for
 * `@supabase/middleware`.
 *
 * Declare your flags with their mandatory defaults, hand it any OpenFeature
 * server client, and every declared flag is resolved concurrently per request
 * and lands at `ctx.flags`, typed from the defaults.
 *
 * @example
 * ```ts
 * import { OpenFeature } from '@openfeature/server-sdk'
 * import { withOpenFeature } from '@supabase/middleware-openfeature'
 *
 * const client = OpenFeature.getClient()
 *
 * export default {
 *   fetch: withOpenFeature(
 *     { client, flags: { betaCheckout: false, theme: 'light' } },
 *     async (_req, ctx) => Response.json({ beta: ctx.flags.betaCheckout }),
 *   ),
 * }
 * ```
 *
 * @packageDocumentation
 */

export { withOpenFeature } from './with-open-feature-types.js'
export type { WithOpenFeature } from './with-open-feature-types.js'
export type {
  FlagClient,
  FlagDefaults,
  Resolved,
  Widen,
  WithOpenFeatureConfig,
} from './types.js'
