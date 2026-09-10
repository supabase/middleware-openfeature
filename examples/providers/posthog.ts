import { OpenFeature } from '@openfeature/server-sdk'
import { PostHogServerProvider } from '@posthog/openfeature-node-provider'
import { PostHog } from 'posthog-node/edge'
import type { FlagClient } from '@supabase-labs/middleware-openfeature'

/** The environment {@link createPostHogFlagClient} needs. */
export interface PostHogEnv {
  /** Project API key, `phc_…`. PostHog → Settings → Project → Project API key. */
  POSTHOG_API_KEY: string
  /** @defaultValue `https://us.i.posthog.com` */
  POSTHOG_HOST?: string
}

/**
 * Build an OpenFeature client backed by PostHog.
 *
 * Two details that are not obvious from PostHog's docs:
 *
 * - **`posthog-node/edge` is imported explicitly**, on every runtime. The bare
 *   specifier picks a build using export conditions, and Deno matches neither
 *   `workerd` nor `edge-light`, so it falls through to the node build — which
 *   reaches `node:fs`, `node:zlib`, `node:readline` and four more. The `/edge`
 *   build reaches 22 files and zero `node:` modules, and runs fine on Node too.
 * - **`defaultDistinctId` is required.** Without it the provider throws
 *   `TargetingKeyMissingError` whenever the evaluation context carries no
 *   `targetingKey` — which is exactly the basic, no-targeting case.
 *   `VercelProvider` has no equivalent requirement.
 */
export async function createPostHogFlagClient(
  env: PostHogEnv,
): Promise<FlagClient> {
  const { PostHog } = await import('posthog-node/edge')
  const { PostHogServerProvider } =
    await import('@posthog/openfeature-node-provider')
  const { OpenFeature } = await import('@openfeature/server-sdk')

  const posthog = new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
  })

  await OpenFeature.setProviderAndWait(
    // The cast is not laziness — it works around a typing bug in
    // @posthog/openfeature-node-provider@0.1.0.
    //
    // The provider has NO runtime dependency on posthog-node (posthog-node is a
    // type-only import for it), and it works perfectly well with a client from
    // the edge build. But its constructor is typed against the *node* build's
    // `PostHog`, and the two classes are structurally incompatible because
    // `compressPayload` is `protected` — protected members only match across a
    // shared class hierarchy, and these two builds do not share one.
    //
    // So the types force the node build while the runtime does not. Verified:
    // constructing the provider with an edge client initialises and resolves
    // flags correctly on Node, Deno and workerd.
    new PostHogServerProvider(posthog as never, {
      defaultDistinctId: 'anonymous',
    }),
  )
  return OpenFeature.getClient()
}
