import type { FetchHandler } from '@supabase/middleware'
import { withOpenFeature } from '@supabase/middleware-openfeature'
import type { FlagClient } from '@supabase/middleware-openfeature'

/**
 * The flags this handler reads, and their defaults.
 *
 * Each default's *type* selects the resolution method, and it must match the
 * flag's type in the provider. Ask for a boolean when the flag is a string and
 * the provider returns `TYPE_MISMATCH`, the middleware falls back to the
 * declared default, and nothing tells you at runtime — `ctx.flags` holds values,
 * not details. See the README for how to check with `reason`.
 */
export const flags = { theme: 'light', betaCheckout: false }

/**
 * Read two flags and return them. The whole example.
 *
 * The client is injected rather than constructed here, which is what lets this
 * exact file run on Supabase Edge Functions, Vercel Functions and Cloudflare
 * Workers without modification — only the credential plumbing differs, and that
 * lives in `providers/` and the per-runtime entry points.
 */
export const createHandler = (client: FlagClient): FetchHandler =>
  withOpenFeature({ client, flags }, async (_req, ctx) =>
    Response.json({
      theme: ctx.flags.theme, // string
      betaCheckout: ctx.flags.betaCheckout, // boolean
    }),
  )
