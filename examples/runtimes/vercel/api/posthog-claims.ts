import { createHandler } from '../../../handlers/posthog-claims.js'
import { createPostHogFlagClient } from '../../../providers/posthog.js'

export default createHandler(
  await createPostHogFlagClient({
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY!,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
  }),
)
