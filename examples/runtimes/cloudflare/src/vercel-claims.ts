import { createHandler } from '../../../handlers/vercel-claims.js'
import { createVercelFlagClient } from '../../../providers/vercel.js'

interface Env {
  /**
   * An SDK key (`vf_server_…`) is REQUIRED here. A pulled OIDC token is not
   * enough: verified in a clean isolate, workerd fails with
   * "No flag definitions available. Bundled definitions not found." while the
   * identical token works on Deno.
   */
  FLAGS: string
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Workers deliver secrets as a fetch argument, but @vercel/flags-core reads
    // process.env. nodejs_compat provides the object; this fills it.
    const proc = (globalThis as { process?: { env: Record<string, string> } })
      .process
    if (proc && env.FLAGS) proc.env.FLAGS = env.FLAGS

    return createHandler(await createVercelFlagClient())(req)
  },
}
