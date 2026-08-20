import { beforeAll, expect, it } from 'vitest'

// Served by the local stack's edge runtime (`supabase start` with
// [edge_runtime] enabled in smoke/edge/supabase/config.toml) and reached
// through the Kong gateway. Start the stack before running this suite:
//   pnpm exec supabase start --workdir smoke/edge
const baseUrl = 'http://127.0.0.1:54341/functions/v1/openfeature-smoke'

let probeResult: any

beforeAll(async () => {
  // The first invocation boots the Deno worker and resolves its npm: imports —
  // poll /health so the cold start is spent here, not inside a test timeout.
  const deadline = Date.now() + 150_000
  for (;;) {
    try {
      const res = await fetch(`${baseUrl}/health`)
      if (res.ok) break
    } catch {
      // gateway not answering yet
    }
    if (Date.now() > deadline) {
      throw new Error(
        `edge function at ${baseUrl} not ready after 150s — is the stack running ` +
          'with [edge_runtime] enabled, and was `bash smoke/edge/vendor.sh` run?',
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  probeResult = await (await fetch(baseUrl)).json()
  console.log('\n=== edge probe result ===')
  console.log(JSON.stringify(probeResult, null, 2))
}, 180_000)

it('boots the worker with @openfeature/server-sdk loaded', () => {
  // The worker booting at all answers design §7's risk about node:events
  // reaching Deno through the server-sdk.
  const probe = probeResult.probes.find(
    (p: any) => p.name === 'openfeature-server-sdk-loads',
  )
  expect(probe.status).toBe('ok')
})

it('reports whether @vercel/flags-core/openfeature loads in the sandbox', () => {
  // NOT asserted either way — this is the finding. Run 1 showed the module
  // needs sys access to "hostname" at load time, which a sandbox may withhold.
  const probe = probeResult.probes.find(
    (p: any) => p.name === 'vercel-provider-loads',
  )
  console.log(
    'vercel-provider-loads:',
    probe.status,
    JSON.stringify(probe.detail),
  )
  expect(['ok', 'failed']).toContain(probe.status)
})

it('reports whether process.env is available in the sandbox', () => {
  // Also not asserted — design §7 lists it as unverified inside Supabase's
  // sandbox specifically, and @vercel/oidc depends on it.
  const probe = probeResult.probes.find(
    (p: any) => p.name === 'process-env-available',
  )
  console.log(
    'process-env-available:',
    probe.status,
    JSON.stringify(probe.detail),
  )
  expect(['ok', 'failed']).toContain(probe.status)
})

it('runs the middleware and contributes ctx.flags', async () => {
  const probe = probeResult.probes.find(
    (p: any) => p.name === 'middleware-runs-in-edge-sandbox',
  )
  expect(probe.status).toBe('ok')

  // And over a real request through the gateway, not just at module init.
  const res = await fetch(`${baseUrl}/resolve`)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ betaCheckout: true, theme: 'light' })
})
