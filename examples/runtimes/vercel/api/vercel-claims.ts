import { createHandler } from '../../../handlers/vercel-claims.js'
import { createVercelFlagClient } from '../../../providers/vercel.js'

// On Vercel this needs no credential at all: the platform injects
// VERCEL_OIDC_TOKEN into its own runtime. This is the only runtime where that
// is true — everywhere else needs an SDK key in FLAGS.
export default createHandler(await createVercelFlagClient())
