import { describe, expect, it, vi } from 'vitest'

import type {
  EvaluationContext,
  EvaluationDetails,
  FlagValue,
  JsonValue,
} from '@openfeature/core'

import { defineMiddleware, seedContext } from '@supabase/middleware'

import { withOpenFeatureRuntime } from './with-open-feature.js'
import type { FlagClient } from './types.js'

type Call = {
  method: string
  flagKey: string
  defaultValue: FlagValue
  context?: EvaluationContext
}

/**
 * A recording `FlagClient`. `values` overrides what the provider returns for a
 * given key; anything absent resolves to the passed default. `rejectKeys` makes
 * the client reject for those keys, which is the hand-rolled-client failure
 * mode that must fall back to the declared default rather than propagate.
 */
function makeClient(
  options: { values?: Record<string, FlagValue>; rejectKeys?: string[] } = {},
) {
  const calls: Call[] = []
  const resolve =
    (method: string) =>
    async (
      flagKey: string,
      defaultValue: FlagValue,
      context?: EvaluationContext,
    ) => {
      calls.push({ method, flagKey, defaultValue, context })
      if (options.rejectKeys?.includes(flagKey))
        throw new Error(`boom: ${flagKey}`)
      const value =
        flagKey in (options.values ?? {})
          ? options.values![flagKey]
          : defaultValue
      return {
        flagKey,
        value,
        reason: 'STATIC',
      } as unknown as EvaluationDetails<never>
    }
  const client = {
    getBooleanDetails: resolve('boolean'),
    getStringDetails: resolve('string'),
    getNumberDetails: resolve('number'),
    getObjectDetails: resolve('object'),
  } as unknown as FlagClient
  return { client, calls }
}

const req = () => new Request('http://localhost/')

describe('withOpenFeatureRuntime', () => {
  it('contributes resolved values at ctx.flags', async () => {
    const { client } = makeClient({
      values: { betaCheckout: true, theme: 'dark', maxItems: 25 },
    })

    const handler = withOpenFeatureRuntime(
      { client, flags: { betaCheckout: false, theme: 'light', maxItems: 10 } },
      async (_r, ctx) => Response.json(ctx.flags),
    )

    expect(await (await handler(req())).json()).toEqual({
      betaCheckout: true,
      theme: 'dark',
      maxItems: 25,
    })
  })

  it('dispatches on the runtime type of each default', async () => {
    const { client, calls } = makeClient()

    const handler = withOpenFeatureRuntime(
      {
        client,
        flags: { b: false, s: 'x', n: 1, o: { a: 1 }, arr: [1, 2], nil: null },
      },
      async () => new Response('ok'),
    )
    await handler(req())

    const byKey = Object.fromEntries(calls.map((c) => [c.flagKey, c.method]))
    expect(byKey).toEqual({
      b: 'boolean',
      s: 'string',
      n: 'number',
      o: 'object',
      arr: 'object',
      nil: 'object',
    })
  })

  it('resolves every flag concurrently rather than in sequence', async () => {
    let inFlight = 0
    let peak = 0
    const slow = async (flagKey: string, defaultValue: FlagValue) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return {
        flagKey,
        value: defaultValue,
      } as unknown as EvaluationDetails<never>
    }
    const client = {
      getBooleanDetails: slow,
      getStringDetails: slow,
      getNumberDetails: slow,
      getObjectDetails: slow,
    } as unknown as FlagClient

    const handler = withOpenFeatureRuntime(
      { client, flags: { a: false, b: false, c: false } },
      async () => new Response('ok'),
    )
    await handler(req())

    expect(peak).toBe(3)
  })

  it('passes the evaluation context from the config callback to the client', async () => {
    const { client, calls } = makeClient()

    const handler = withOpenFeatureRuntime(
      {
        client,
        flags: { a: false },
        context: (r) => ({ targetingKey: r.headers.get('x-user') ?? 'anon' }),
      },
      async () => new Response('ok'),
    )
    await handler(
      new Request('http://localhost/', { headers: { 'x-user': 'ada' } }),
    )

    expect(calls[0].context).toEqual({ targetingKey: 'ada' })
  })

  it('omits the evaluation context when no callback is configured', async () => {
    const { client, calls } = makeClient()

    const handler = withOpenFeatureRuntime(
      { client, flags: { a: false } },
      async () => new Response('ok'),
    )
    await handler(req())

    expect(calls[0].context).toBeUndefined()
  })

  it('gives the context callback the accumulated upstream ctx at runtime', async () => {
    const { client, calls } = makeClient()

    // Composed under a real upstream middleware, which is the production path:
    // `defineMiddleware` passes the accumulated context object
    // through, so an upstream key is visible to the config callback.
    const withClaims = defineMiddleware<
      'jwtClaims',
      void,
      Record<never, never>,
      { sub: string }
    >({
      key: 'jwtClaims',
      run: () => async () => ({ jwtClaims: { sub: 'user-1' } }),
    })

    const handler = withClaims(
      withOpenFeatureRuntime(
        {
          client,
          flags: { a: false },
          context: (_r, ctx) => ({
            targetingKey:
              (ctx as { jwtClaims?: { sub: string } }).jwtClaims?.sub ?? 'anon',
          }),
        },
        async () => new Response('ok'),
      ),
    )
    await handler(req())

    expect(calls[0].context).toEqual({ targetingKey: 'user-1' })
  })

  it('treats an unmarked object in the ctx slot as a platform arg, not a context', async () => {
    const { client, calls } = makeClient()

    // Pinning surprising engine behaviour rather than asserting a preference.
    // `isContext` looks for a symbol marker that only `seedContext` sets, so a
    // hand-rolled `{ jwtClaims }` passed positionally is read as the host's
    // platform argument (a Workers `env`, a Deno `ServeHandlerInfo`) and a
    // fresh empty context is seeded instead. A middleware author testing their
    // config callback by hand-passing a ctx will see it silently ignored.
    const handler = withOpenFeatureRuntime(
      {
        client,
        flags: { a: false },
        context: (_r, ctx) => ({
          targetingKey:
            (ctx as { jwtClaims?: { sub: string } }).jwtClaims?.sub ?? 'anon',
        }),
      },
      async () => new Response('ok'),
    )
    await handler(req(), { jwtClaims: { sub: 'user-1' } })

    expect(calls[0].context).toEqual({ targetingKey: 'anon' })
  })

  it('sees upstream keys spread onto a seedContext-minted context', async () => {
    const { client, calls } = makeClient()

    // The documented way for a host embedding the engine (e.g. @supabase/server)
    // to mint a valid upstream context and spread its own keys onto it.
    const handler = withOpenFeatureRuntime(
      {
        client,
        flags: { a: false },
        context: (_r, ctx) => ({
          targetingKey:
            (ctx as { jwtClaims?: { sub: string } }).jwtClaims?.sub ?? 'anon',
        }),
      },
      async () => new Response('ok'),
    )
    await handler(req(), { ...seedContext(), jwtClaims: { sub: 'user-2' } })

    expect(calls[0].context).toEqual({ targetingKey: 'user-2' })
  })

  it('falls back to the declared default when the client rejects, per flag', async () => {
    const { client } = makeClient({
      values: { ok: 'resolved' },
      rejectKeys: ['broken'],
    })

    const handler = withOpenFeatureRuntime(
      { client, flags: { ok: 'default-ok', broken: 'default-broken' } },
      async (_r, ctx) => Response.json(ctx.flags),
    )

    const res = await handler(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: 'resolved',
      broken: 'default-broken',
    })
  })

  it('never short-circuits — the handler always runs', async () => {
    const { client } = makeClient({ rejectKeys: ['a'] })
    const inner = vi.fn(async () => Response.json({ ran: true }))

    const handler = withOpenFeatureRuntime(
      { client, flags: { a: false } },
      inner,
    )
    await handler(req())

    expect(inner).toHaveBeenCalledOnce()
  })

  it('leaves the request body readable by the handler', async () => {
    const { client } = makeClient()

    const handler = withOpenFeatureRuntime(
      { client, flags: { a: false } },
      async (r) => Response.json({ again: await r.json() }),
    )

    const res = await handler(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'ada' }),
      }),
    )
    expect(await res.json()).toEqual({ again: { name: 'ada' } })
  })

  it('contributes an empty object when no flags are declared', async () => {
    const { client, calls } = makeClient()

    const handler = withOpenFeatureRuntime(
      { client, flags: {} },
      async (_r, ctx) => Response.json(ctx.flags),
    )

    expect(await (await handler(req())).json()).toEqual({})
    expect(calls).toHaveLength(0)
  })

  it('preserves a JSON object flag value', async () => {
    const nested: JsonValue = { tier: 'pro', limits: { rpm: 60 } }
    const { client } = makeClient({ values: { plan: nested } })

    const handler = withOpenFeatureRuntime(
      { client, flags: { plan: { tier: 'free', limits: { rpm: 10 } } } },
      async (_r, ctx) => Response.json(ctx.flags),
    )

    expect(await (await handler(req())).json()).toEqual({ plan: nested })
  })
})
