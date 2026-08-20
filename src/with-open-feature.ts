/**
 * The `withOpenFeature` runtime.
 *
 * Implemented with `defineMiddleware`, so it inherits context seeding, request
 * buffering, contribution extraction and platform-arg detection from the
 * engine. Its published *types* are a bespoke overload set — see
 * `./with-open-feature-types.ts` — because `defineMiddleware`'s `Middleware`
 * does not expose the accumulated-upstream generic that `config.context`'s
 * callback needs.
 *
 * @packageDocumentation
 */

import { defineMiddleware } from '@supabase/middleware'
import type { BaseContext, Middleware } from '@supabase/middleware'

import type { EvaluationContext, FlagValue, JsonValue } from '@openfeature/core'

import type {
  FlagClient,
  FlagDefaults,
  WithOpenFeatureConfig,
} from './types.js'

/** The config shape the runtime is defined against, with `Base` erased. */
export type AnyOpenFeatureConfig = WithOpenFeatureConfig<
  FlagDefaults,
  BaseContext
>

/**
 * Resolve one flag, dispatching on the runtime type of its default.
 *
 * An OpenFeature client already returns the default with `reason: 'ERROR'`
 * rather than throwing, so the `catch` here is for the other cases: a
 * hand-rolled `FlagClient`, or a network fault that escapes the client. Falling
 * back per-flag is what keeps the middleware from ever short-circuiting — a
 * provider outage is not a bad *request*, so there is nothing to reject
 * (design §5.2, Rule 8).
 */
async function resolveFlag(
  client: FlagClient,
  flagKey: string,
  defaultValue: FlagValue,
  context: EvaluationContext | undefined,
): Promise<FlagValue> {
  try {
    switch (typeof defaultValue) {
      case 'boolean':
        return (await client.getBooleanDetails(flagKey, defaultValue, context))
          .value
      case 'string':
        return (await client.getStringDetails(flagKey, defaultValue, context))
          .value
      case 'number':
        return (await client.getNumberDetails(flagKey, defaultValue, context))
          .value
      default:
        return (
          await client.getObjectDetails(
            flagKey,
            defaultValue as JsonValue,
            context,
          )
        ).value
    }
  } catch {
    return defaultValue
  }
}

/**
 * The raw `defineMiddleware` result. Exported for the type layer to re-publish
 * under the bespoke signature; consumers import `withOpenFeature` instead.
 */
export const withOpenFeatureRuntime: Middleware<
  'flags',
  AnyOpenFeatureConfig,
  Record<never, never>,
  Record<string, FlagValue>
> = defineMiddleware<
  // 1. Key — one key, `flags`. All declared flags live under it (Rule 1).
  'flags',
  // 2. Config — the client, the flag defaults, and the context callback.
  AnyOpenFeatureConfig,
  // 3. In — no upstream prerequisites. The targeting key comes from a config
  //    callback, not from a runtime probe for an upstream key (Rule 3).
  Record<never, never>,
  // 4. Contribution — resolved values. The bespoke signature narrows this to
  //    `Resolved<F>` for the consumer.
  Record<string, FlagValue>
>({
  key: 'flags',
  run: (config) => async (req, ctx) => {
    const evaluationContext = config.context?.(req, ctx)

    // Resolve concurrently: one round trip's latency for the whole set rather
    // than the sum (design §5.1).
    const resolved = await Promise.all(
      Object.entries(config.flags).map(
        async ([flagKey, defaultValue]) =>
          [
            flagKey,
            await resolveFlag(
              config.client,
              flagKey,
              defaultValue,
              evaluationContext,
            ),
          ] as const,
      ),
    )

    return { flags: Object.fromEntries(resolved) }
  },
})
