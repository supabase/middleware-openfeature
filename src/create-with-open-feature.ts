/**
 * `createWithOpenFeature`: build the middleware where the flags are known.
 *
 * @packageDocumentation
 */

import { defineMiddleware } from '@supabase/middleware'
import type { BaseContext, Middleware } from '@supabase/middleware'

import { resolveFlags } from './with-open-feature.js'
import type { FlagDefaults, Resolved, WithOpenFeatureConfig } from './types.js'

/**
 * Build a middleware that resolves OpenFeature flags per request and
 * contributes their values at `ctx.flags`.
 *
 * `ctx.flags` is typed from `flags`. The keys the `context` callback's `ctx`
 * parameter declares become the middleware's prerequisites, so a stack with no
 * provider for them fails to compile, nested or in a `pipeline`. Annotate what
 * the callback reads: an unannotated `ctx` has no keys.
 *
 * The result is a plain `Middleware`, called with no config.
 *
 * @example
 * ```ts
 * const withFlags = createWithOpenFeature({
 *   client,
 *   flags: { betaCheckout: false },
 *   context: (_req, ctx: { jwtClaims: JWTClaims | null }) => ({
 *     targetingKey: ctx.jwtClaims?.sub ?? 'anon',
 *   }),
 * })
 *
 * withClaims(withFlags(handler)) // nested
 * pipeline([withClaims(), withFlags()], handler) // flat
 * ```
 */
export function createWithOpenFeature<
  F extends FlagDefaults,
  In extends BaseContext = Record<never, never>,
>(
  config: WithOpenFeatureConfig<F, In>,
): Middleware<'flags', void, In, Resolved<F>> {
  return defineMiddleware<'flags', void, In, Resolved<F>>({
    key: 'flags',
    run: () => resolveFlags(config),
  })
}
