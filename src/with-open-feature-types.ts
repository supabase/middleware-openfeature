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

import type {
  BaseContext,
  NoConflict,
  SingleKeyEntry,
} from '@supabase/middleware'

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
  // constraint. `config` is deliberately NOT wrapped in `NoInfer`: it is
  // unnecessary here and fatal on the config-only overload below.
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
  // Handler call, propagation form — reached only when the signature above
  // fails, which is exactly the unanchored-prerequisite case. With an anchor,
  // `Base` carries the accumulated upstream inward and the cascade above
  // already satisfies the wrapped handler at any depth. Unanchored there is
  // nothing to carry — `Base` collapses to its constraint — so the requirement
  // has to travel *outward* instead: `Ctx` is read off the wrapped handler's
  // declared `ctx` and republished minus the key this layer contributes, until
  // some enclosing layer discharges it.
  //
  // `Ctx extends BaseContext & { flags?: Resolved<F> }` is what keeps the
  // `Omit` honest: omitting by key name alone would discharge a requirement for
  // `flags` of the wrong shape. The optional-key constraint checks the type
  // where the key is present and is vacuous where it is not.
  //
  // Verified necessary, not speculative. The design doc first recorded this as
  // an open question, on the grounds that `In` is empty here. It is required
  // anyway:
  // without it, an unanchored stack whose handler declares an upstream key
  // fails with "Property 'jwtClaims' is missing in type
  // '{ flags: Resolved<{ a: false; }>; }'". See A13 in type-tests/positive.ts.
  <
    F extends FlagDefaults,
    Base extends BaseContext = BaseContext,
    Ctx extends BaseContext & { flags?: Resolved<F> } = BaseContext,
  >(
    config: WithOpenFeatureConfig<F, Base>,
    handler: NoConflict<
      'flags',
      Base,
      (req: Request, ctx: Ctx) => Promise<Response>
    >,
  ): (req: Request, ctx: Base & Omit<Ctx, 'flags'>) => Promise<Response>
  // Config-only call — an `Entry` for a `pipeline` array. `NoInfer` must NEVER
  // wrap `config` here: an explicit param annotation on the context callback is
  // the sole channel by which `Base` can be supplied in this form, and
  // `NoInfer` closes it.
  <F extends FlagDefaults, Base extends BaseContext = BaseContext>(
    config: WithOpenFeatureConfig<F, Base>,
  ): SingleKeyEntry<'flags', Record<never, never>, Resolved<F>>
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
