import type { FlagClient } from '@supabase/middleware-openfeature'

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
 * A hand-pulled OIDC token (`vercel env pull`) also authenticates off-Vercel,
 * but the examples do not use one: it expires after 12 hours, and on Cloudflare
 * Workers it fails outright with "No flag definitions available" even though the
 * same token works on Deno.
 */
export async function createVercelFlagClient(): Promise<FlagClient> {
  const { OpenFeature } = await import('@openfeature/server-sdk')
  const { VercelProvider } = await import('@vercel/flags-core/openfeature')

  await OpenFeature.setProviderAndWait(new VercelProvider())
  return OpenFeature.getClient()
}
