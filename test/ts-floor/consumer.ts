import { OpenFeature } from '@openfeature/server-sdk'
import {
  createWithOpenFeature,
  withOpenFeature,
} from '@supabase-labs/middleware-openfeature'
import type { FlagClient } from '@supabase-labs/middleware-openfeature'

// A real OpenFeature client satisfies the structural client with no adapter.
const client: FlagClient = OpenFeature.getClient()

// The handler overload, which is where `NoInfer` lives in the published .d.ts.
export const fetch = withOpenFeature(
  {
    client,
    flags: { betaCheckout: false, theme: 'light', maxItems: 10 },
    context: (req) => ({ targetingKey: req.headers.get('x-user') ?? 'anon' }),
  },
  async (_req, ctx) => {
    const beta: boolean = ctx.flags.betaCheckout
    const theme: string = ctx.flags.theme
    const maxItems: number = ctx.flags.maxItems
    return Response.json({ beta, theme, maxItems })
  },
)

// The factory, whose result is the engine's own `Middleware` type.
const withFlags = createWithOpenFeature({
  client,
  flags: { betaCheckout: false, theme: 'light', maxItems: 10 },
  context: (req) => ({ targetingKey: req.headers.get('x-user') ?? 'anon' }),
})

export const fetchFromFactory = withFlags(async (_req, ctx) => {
  const beta: boolean = ctx.flags.betaCheckout
  const theme: string = ctx.flags.theme
  const maxItems: number = ctx.flags.maxItems
  return Response.json({ beta, theme, maxItems })
})
