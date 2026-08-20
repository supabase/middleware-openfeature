/**
 * The published type signature for `withOpenFeature`.
 *
 * `defineMiddleware`'s `Middleware<Key, Config, In, Contribution>` has no
 * generic for the accumulated upstream context, so a config callback that reads
 * upstream keys cannot be typed through it. This bespoke overload set adds a
 * `Base` parameter and threads it into the config, per the pattern the engine's
 * `NoConflict` docblock sanctions.
 *
 * @packageDocumentation
 */

import type { BaseContext, Entry, NoConflict } from '@supabase/middleware'

import { withOpenFeatureRuntime } from './with-open-feature.js'
import type { FlagDefaults, Resolved, WithOpenFeatureConfig } from './types.js'

/**
 * Resolve OpenFeature flags per request and contribute their values at
 * `ctx.flags`.
 *
 * Two forms:
 *
 * - `withOpenFeature(config, handler)` — nesting. The config callback's `ctx`
 *   is typed against the accumulated upstream automatically.
 * - `withOpenFeature(config)` — an `Entry` for a `pipeline` array. Composition,
 *   ordering and handler typing all work normally; only a config callback that
 *   *reads* an upstream key needs a one-line param annotation, because the
 *   config expression is checked before `pipeline` sees the array.
 *
 * @example Nesting — nothing to annotate
 * ```ts
 * withClaims(
 *   withOpenFeature(
 *     {
 *       client,
 *       flags: { betaCheckout: false },
 *       context: (_req, ctx) => ({ targetingKey: ctx.jwtClaims?.sub ?? 'anon' }),
 *     },
 *     async (_req, ctx) => Response.json({ beta: ctx.flags.betaCheckout }),
 *   ),
 * )
 * ```
 *
 * @example Pipeline — one inline annotation on the config callback
 * ```ts
 * pipeline(
 *   [
 *     withClaims(),
 *     withOpenFeature({
 *       client,
 *       flags: { betaCheckout: false },
 *       context: (_req, ctx: { jwtClaims: JWTClaims | null }) => ({
 *         targetingKey: ctx.jwtClaims?.sub ?? 'anon',
 *       }),
 *     }),
 *   ],
 *   async (_req, ctx) => Response.json({ beta: ctx.flags.betaCheckout }),
 * )
 * ```
 */
export interface WithOpenFeature {
  // Handler call. `Base` flows *inward* from the contextual type of this call's
  // return, which is what lets the config callback see the accumulated upstream
  // with no annotation. `NoInfer` on the handler's `ctx` keeps that cascade
  // alive past two layers — left inferable it becomes a second inference site
  // that outranks the contextual return type and collapses `Base` to its
  // constraint. `config` is deliberately NOT wrapped in `NoInfer`: design §4.2
  // verified it is unnecessary here and fatal on the overload below.
  <F extends FlagDefaults, Base extends BaseContext = BaseContext>(
    config: WithOpenFeatureConfig<F, Base>,
    handler: NoConflict<
      'flags',
      Base,
      (
        req: Request,
        ctx: NoInfer<Base> & { flags: Resolved<F> },
      ) => Promise<Response>
    >,
  ): (req: Request, ctx?: Base) => Promise<Response>
  // Config-only call — an `Entry` for a `pipeline` array. `NoInfer` must NEVER
  // wrap `config` here: an explicit param annotation on the context callback is
  // the sole channel by which `Base` can be supplied in this form, and
  // `NoInfer` closes it (design §4.2, last row).
  <F extends FlagDefaults, Base extends BaseContext = BaseContext>(
    config: WithOpenFeatureConfig<F, Base>,
  ): Entry<'flags', Record<never, never>, Resolved<F>>
}

/**
 * Resolve OpenFeature flags per request and contribute their values at
 * `ctx.flags`.
 *
 * The cast is the whole point of the split: the runtime is a perfectly ordinary
 * `defineMiddleware` middleware, and only its published *type* is bespoke. The
 * two agree by construction — the runtime contributes `Record<string, FlagValue>`
 * under the key `flags`, and `Resolved<F>` is exactly that record narrowed to
 * the declared keys.
 */
export const withOpenFeature: WithOpenFeature =
  withOpenFeatureRuntime as unknown as WithOpenFeature
