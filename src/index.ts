/**
 * `@supabase-labs/middleware-openfeature` — typed OpenFeature flag resolution for
 * `@supabase/middleware`.
 *
 * Declare your flags with their mandatory defaults, hand it any OpenFeature
 * server client, and every declared flag is resolved concurrently per request
 * and lands at `ctx.flags`, typed from the defaults.
 *
 * @example
 * ```ts
 * import { OpenFeature } from '@openfeature/server-sdk'
 * import { createWithOpenFeature } from '@supabase-labs/middleware-openfeature'
 *
 * const withFlags = createWithOpenFeature({
 *   client: OpenFeature.getClient(),
 *   flags: { betaCheckout: false, theme: 'light' },
 * })
 *
 * export default {
 *   fetch: withFlags(async (_req, ctx) =>
 *     Response.json({ beta: ctx.flags.betaCheckout }),
 *   ),
 * }
 * ```
 *
 * @packageDocumentation
 */

export { createWithOpenFeature } from './create-with-open-feature.js'
export { withOpenFeature } from './with-open-feature-types.js'
export type { WithOpenFeature } from './with-open-feature-types.js'
export type {
  FlagClient,
  FlagDefaults,
  Resolved,
  Widen,
  WithOpenFeatureConfig,
} from './types.js'
