import { createHandler } from '../../../handlers/posthog-claims.js'
import { createPostHogFlagClient } from '../../../providers/posthog.js'

interface Env {
  POSTHOG_API_KEY: string
  POSTHOG_HOST?: string
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // No process.env shim needed: the PostHog client takes its config as an
    // argument rather than reading the environment itself.
    const client = await createPostHogFlagClient({
      POSTHOG_API_KEY: env.POSTHOG_API_KEY,
      POSTHOG_HOST: env.POSTHOG_HOST,
    })
    return createHandler(client)(req)
  },
}
