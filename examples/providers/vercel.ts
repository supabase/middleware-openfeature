import { OpenFeature } from '@openfeature/server-sdk'
import { VercelProvider } from '@vercel/flags-core/openfeature'
import type { FlagClient } from '@supabase-labs/middleware-openfeature'

/**
 * Build an OpenFeature client backed by Vercel Flags.
 *
 * Credentials come from the environment, and which one depends on where this
 * runs:
 *
 * - **On Vercel Functions:** nothing. The platform injects `VERCEL_OIDC_TOKEN`
 *   into its own runtime, so this works with no configuration at all.
 * - **Everywhere else:** an SDK key in `FLAGS` (`vf_server_…`), from the Vercel
 *   dashboard under Flags → SDK Keys.
 *
 * **Imports here are static, deliberately.** An earlier version loaded the
 * provider with `await import()` inside this function. That works on Node and on
 * Cloudflare Workers, but on the Supabase edge runtime it fails with
 * `@vercel/flags-core: No flag definitions available. Bundled definitions not
 * found.` — the same error you get with no credential at all, which makes it
 * badly misleading. Static imports resolve it.
 *
 * A hand-pulled OIDC token (`vercel env pull`) also authenticates off-Vercel,
 * but the examples do not use one: it expires after 12 hours, and on Cloudflare
 * Workers it fails outright with "No flag definitions available" even though the
 * same token works on Deno.
 */
export async function createVercelFlagClient(): Promise<FlagClient> {
  await OpenFeature.setProviderAndWait(new VercelProvider())
  return OpenFeature.getClient()
}
