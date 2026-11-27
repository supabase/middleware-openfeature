import { describe, expect, it } from 'vitest'

import type {
  EvaluationContext,
  EvaluationDetails,
  FlagValue,
} from '@openfeature/core'

import { defineMiddleware, pipeline } from '@supabase/middleware'
import type { FetchHandler } from '@supabase/middleware'

import { createWithOpenFeature } from './create-with-open-feature.js'
import type { FlagClient } from './types.js'

/** A `FlagClient` that resolves `values` and records each evaluation context. */
function recordingClient(values: Record<string, FlagValue> = {}) {
  const contexts: (EvaluationContext | undefined)[] = []
  const resolve = async (
    flagKey: string,
    defaultValue: FlagValue,
    context?: EvaluationContext,
  ) => {
    contexts.push(context)
    return {
      flagKey,
      value: flagKey in values ? values[flagKey] : defaultValue,
      reason: 'STATIC',
    } as unknown as EvaluationDetails<never>
  }
  const client = {
    getBooleanDetails: resolve,
    getStringDetails: resolve,
    getNumberDetails: resolve,
    getObjectDetails: resolve,
  } as unknown as FlagClient
  return { client, contexts }
}

const withClaims = defineMiddleware<
  'jwtClaims',
  void,
  Record<never, never>,
  { sub: string }
>({
  key: 'jwtClaims',
  run: () => async () => ({ jwtClaims: { sub: 'user-1' } }),
})

const req = () => new Request('http://localhost/')

describe('createWithOpenFeature', () => {
  it('nested: resolves flags with the evaluation context built from upstream', async () => {
    const { client, contexts } = recordingClient({ beta: true })
    const withFlags = createWithOpenFeature({
      client,
      flags: { beta: false, theme: 'light' },
      context: (_req, ctx: { jwtClaims: { sub: string } }) => ({
        targetingKey: ctx.jwtClaims.sub,
      }),
    })

    const handler = withClaims(
      withFlags(async (_req, ctx) => Response.json(ctx.flags)),
    ) satisfies FetchHandler

    expect(await (await handler(req())).json()).toEqual({
      beta: true,
      theme: 'light',
    })
    expect(contexts).toEqual([
      { targetingKey: 'user-1' },
      { targetingKey: 'user-1' },
    ])
  })

  it('pipeline: the entry form resolves against the same config', async () => {
    const { client, contexts } = recordingClient({ theme: 'dark' })
    const withFlags = createWithOpenFeature({
      client,
      flags: { theme: 'light' },
      context: (_req, ctx: { jwtClaims: { sub: string } }) => ({
        targetingKey: ctx.jwtClaims.sub,
      }),
    })

    const handler = pipeline([withClaims(), withFlags()], async (_req, ctx) =>
      Response.json({ theme: ctx.flags.theme, sub: ctx.jwtClaims.sub }),
    )

    expect(await (await handler(req())).json()).toEqual({
      theme: 'dark',
      sub: 'user-1',
    })
    expect(contexts).toEqual([{ targetingKey: 'user-1' }])
  })

  it('omits the evaluation context when no callback is configured', async () => {
    const { client, contexts } = recordingClient()
    const withFlags = createWithOpenFeature({ client, flags: { a: false } })

    const handler = withFlags(async (_req, ctx) => Response.json(ctx.flags))

    expect(await (await handler(req())).json()).toEqual({ a: false })
    expect(contexts).toEqual([undefined])
  })
})
