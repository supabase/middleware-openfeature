import { createHandler } from '../_shared/handlers/vercel-basic.ts'
import { createVercelFlagClient } from '../_shared/providers/vercel.ts'

// Off Vercel, Vercel Flags needs an SDK key in FLAGS. Delivered here through
// [edge_runtime.secrets] in supabase/config.toml.
Deno.serve(createHandler(await createVercelFlagClient()))
