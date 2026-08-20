/**
 * Public types for `@supabase/middleware-openfeature`.
 *
 * The client is accepted **structurally**: `FlagClient` names the four methods
 * this middleware calls, so any OpenFeature server client satisfies it as-is
 * and this package never has to depend on `@openfeature/server-sdk` — or on
 * its `node:events` import, which would break the authoring guide's Rule 7.
 * Only `@openfeature/core` is imported, and only for types; it has zero
 * dependencies and zero `node:` imports.
 *
 * @packageDocumentation
 */

import type {
  EvaluationContext,
  EvaluationDetails,
  FlagValue,
  JsonValue,
} from '@openfeature/core'

/**
 * The slice of an OpenFeature client this middleware calls.
 *
 * Structurally identical to the standard's `Client`, so any OpenFeature server
 * client satisfies it with zero adapter code — the real signatures carry a
 * fourth `options?: FlagEvaluationOptions` parameter and generic overloads,
 * both of which are compatible in this direction. A partner not using
 * OpenFeature implements these four methods and nothing else.
 *
 * @example
 * ```ts
 * import { OpenFeature } from '@openfeature/server-sdk'
 *
 * const client: FlagClient = OpenFeature.getClient()
 * ```
 */
export interface FlagClient {
  /** Resolve a boolean flag, with details. */
  getBooleanDetails(
    flagKey: string,
    defaultValue: boolean,
    context?: EvaluationContext,
  ): Promise<EvaluationDetails<boolean>>
  /** Resolve a string flag, with details. */
  getStringDetails(
    flagKey: string,
    defaultValue: string,
    context?: EvaluationContext,
  ): Promise<EvaluationDetails<string>>
  /** Resolve a number flag, with details. */
  getNumberDetails(
    flagKey: string,
    defaultValue: number,
    context?: EvaluationContext,
  ): Promise<EvaluationDetails<number>>
  /** Resolve an object flag, with details. */
  getObjectDetails(
    flagKey: string,
    defaultValue: JsonValue,
    context?: EvaluationContext,
  ): Promise<EvaluationDetails<JsonValue>>
}

/**
 * A map of flag key to its **mandatory** default.
 *
 * Mandatory defaults fall out of the shape — there is no way to declare a flag
 * without one, which is the OpenFeature invariant. Each default's *runtime*
 * type also selects the resolution method: `boolean` → `getBooleanDetails`,
 * `string` → `getStringDetails`, `number` → `getNumberDetails`, anything else
 * → `getObjectDetails`.
 */
export type FlagDefaults = Record<string, FlagValue>

/**
 * Widen a literal default to its base type.
 *
 * Without this, `flags: { beta: false }` gives `ctx.flags.beta` the literal
 * type `false`, and assigning a general `boolean` to it fails with
 * `Type 'boolean' is not assignable to type 'false'`. Boolean is the case that
 * bites; string and number are covered uniformly so neither has to be relied
 * on either way.
 */
export type Widen<T> = T extends boolean
  ? boolean
  : T extends string
    ? string
    : T extends number
      ? number
      : T

/** The shape contributed at `ctx.flags`: every declared key, widened. */
export type Resolved<F extends FlagDefaults> = { [K in keyof F]: Widen<F[K]> }

/**
 * Per-instance configuration for `withOpenFeature`.
 *
 * @typeParam F - The declared flags and their defaults.
 * @typeParam Base - The accumulated upstream context, so `context`'s callback
 *   can read keys earlier middleware contributed. In the `pipeline` form this
 *   needs a one-line param annotation — see the package README.
 */
export interface WithOpenFeatureConfig<F extends FlagDefaults, Base> {
  /** The OpenFeature client (or any four-method stand-in) to resolve against. */
  client: FlagClient
  /** Flag keys mapped to their mandatory defaults. */
  flags: F
  /**
   * Build the evaluation context for this request. Typically supplies
   * `targetingKey` from an upstream auth middleware.
   *
   * @defaultValue no evaluation context is passed to the client
   */
  context?: (req: Request, ctx: Base) => EvaluationContext
}
