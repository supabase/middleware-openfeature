import { describe, expect, it } from 'vitest'

import type {
  EvaluationContext,
  EvaluationDetails,
  FlagValue,
} from '@openfeature/core'
import { pipeline } from '@supabase/middleware'
import type { FetchHandler } from '@supabase/middleware'
import { withSupabase } from '@supabase/server'
import type { AuthMode, JWTClaims, SupabaseContext } from '@supabase/server'

import { withOpenFeature } from './index.js'
import type { FlagClient } from './types.js'

// `@supabase/server` is a devDependency for these tests only. They pin that a
// middleware written against the authoring guide composes with `withSupabase`
// in both call forms, with `withSupabase` as a `pipeline` entry, and that the
// composite's internal plumbing never reaches a third party's `ctx`.

const env = {
  url: 'https://test.supabase.co',
  publishableKeys: { default: 'sb_publishable_xyz' },
  secretKeys: { default: 'sb_secret_xyz' },
  jwks: null,
}

/** A `FlagClient` that records the evaluation context of every call. */
function recordingClient() {
  const contexts: (EvaluationContext | undefined)[] = []
  const resolve = async (
    flagKey: string,
    defaultValue: FlagValue,
    context?: EvaluationContext,
  ) => {
    contexts.push(context)
    return {
      flagKey,
      value: defaultValue,
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

const INTERNAL_KEYS = ['supabaseAuth', 'supabaseCors', 'supabaseBoundary']

describe('composition with @supabase/server', () => {
  it('pipeline: an entry after withSupabase reads the claims it contributes', async () => {
    const { client, contexts } = recordingClient()
    const app = pipeline(
      [
        withSupabase({ auth: 'none', env }),
        withOpenFeature({
          client,
          flags: { beta: false },
          context: (
            _req,
            ctx: { jwtClaims: JWTClaims | null; authMode: AuthMode },
          ) => ({ targetingKey: ctx.jwtClaims?.sub ?? `anon:${ctx.authMode}` }),
        }),
      ],
      async (_req, ctx) =>
        Response.json({
          flags: ctx.flags,
          keys: Object.keys(ctx),
          hasClient: typeof ctx.supabase.from === 'function',
        }),
    )

    const res = await app(new Request('http://localhost/'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.flags).toEqual({ beta: false })
    expect(body.hasClient).toBe(true)
    expect(contexts).toEqual([{ targetingKey: 'anon:none' }])
    expect(body.keys).toEqual(
      expect.arrayContaining([
        'flags',
        'supabase',
        'supabaseAdmin',
        'jwtClaims',
        'userClaims',
        'authMode',
      ]),
    )
    expect(body.keys).not.toEqual(expect.arrayContaining(INTERNAL_KEYS))
  })

  // The callback annotation is the same one the pipeline form needs. Nested
  // under `withSupabase` the cascade does not carry `Base` into a hand-written
  // inner signature on its own; type-tests/positive.ts S2 and S2b pin the two
  // spellings that type, and negative.ts NS3 pins the bare form as failing.
  it('nested: the callback reads the composite context through the annotation', async () => {
    const { client, contexts } = recordingClient()
    const app = withSupabase(
      { auth: 'none', env },
      withOpenFeature(
        {
          client,
          flags: { beta: false },
          context: (_req, ctx: SupabaseContext) => ({
            targetingKey: ctx.jwtClaims?.sub ?? `anon:${ctx.authMode}`,
          }),
        },
        async (_req, ctx) =>
          Response.json({ beta: ctx.flags.beta, keys: Object.keys(ctx) }),
      ),
    ) satisfies FetchHandler

    const res = await app(new Request('http://localhost/'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.beta).toBe(false)
    expect(contexts).toEqual([{ targetingKey: 'anon:none' }])
    expect(body.keys).not.toEqual(expect.arrayContaining(INTERNAL_KEYS))
  })

  it('pipeline: an entry before withSupabase runs ahead of the auth gate', async () => {
    const { client, contexts } = recordingClient()
    let handlerRan = false
    const app = pipeline(
      [
        withOpenFeature({ client, flags: { beta: false } }),
        withSupabase({ auth: 'user', env }),
      ],
      async () => {
        handlerRan = true
        return Response.json({ ok: true })
      },
    )

    const res = await app(new Request('http://localhost/'))

    expect(res.status).toBe(401)
    expect(contexts).toHaveLength(1)
    expect(handlerRan).toBe(false)
  })

  it('pipeline: the composite CORS part stamps the third-party entry response', async () => {
    const { client } = recordingClient()
    const app = pipeline(
      [
        withSupabase({ auth: 'none', env }),
        withOpenFeature({ client, flags: {} }),
      ],
      async () => Response.json({ ok: true }),
    )

    const res = await app(
      new Request('http://localhost/', {
        headers: { origin: 'https://app.example.com' },
      }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).not.toBeNull()
  })
})
