import { createHandler } from '../_shared/handlers/posthog-basic.ts'
import { createPostHogFlagClient } from '../_shared/providers/posthog.ts'

Deno.serve(
  createHandler(
    await createPostHogFlagClient({
      POSTHOG_API_KEY: Deno.env.get('POSTHOG_API_KEY')!,
      POSTHOG_HOST: Deno.env.get('POSTHOG_HOST'),
    }),
  ),
)
