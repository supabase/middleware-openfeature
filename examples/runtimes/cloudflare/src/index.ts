import { createHandler as vercelBasic } from '../../../handlers/vercel-basic.js'
import { createHandler as vercelClaims } from '../../../handlers/vercel-claims.js'
import { createHandler as posthogBasic } from '../../../handlers/posthog-basic.js'
import { createHandler as posthogClaims } from '../../../handlers/posthog-claims.js'
import { createVercelFlagClient } from '../../../providers/vercel.js'
import { createPostHogFlagClient } from '../../../providers/posthog.js'

interface Env {
  /** SDK key, `vf_server_…`. An OIDC token does not work on workerd. */
  FLAGS: string
  POSTHOG_API_KEY: string
  POSTHOG_HOST?: string
}

/**
 * One worker exposing all four examples, so a single deployment demonstrates the
 * whole matrix:
 *
 *   /vercel-basic    /vercel-claims    /posthog-basic    /posthog-claims
 *
 * The individual `src/<name>.ts` files remain as the minimal, copy-paste shape
 * of a single example. This file exists for demonstration, not because a real
 * worker needs it.
 */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url)

    // @vercel/flags-core reads process.env; Workers deliver secrets as an
    // argument. nodejs_compat provides the object, this fills it.
    const proc = (globalThis as { process?: { env: Record<string, string> } })
      .process
    if (proc && env.FLAGS) proc.env.FLAGS = env.FLAGS

    const posthogEnv = {
      POSTHOG_API_KEY: env.POSTHOG_API_KEY,
      POSTHOG_HOST: env.POSTHOG_HOST,
    }

    switch (pathname) {
      case '/vercel-basic':
        return vercelBasic(await createVercelFlagClient())(req)
      case '/vercel-claims':
        return vercelClaims(await createVercelFlagClient())(req)
      case '/posthog-basic':
        return posthogBasic(await createPostHogFlagClient(posthogEnv))(req)
      case '/posthog-claims':
        return posthogClaims(await createPostHogFlagClient(posthogEnv))(req)
      default:
        return Response.json({
          examples: [
            '/vercel-basic',
            '/vercel-claims',
            '/posthog-basic',
            '/posthog-claims',
          ],
          runtime: 'cloudflare-workers',
        })
    }
  },
}
