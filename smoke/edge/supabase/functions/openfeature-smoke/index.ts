/**
 * Design §7, run 2: does the stack boot and resolve on the Deno runtime that
 * Supabase Edge Functions actually use?
 *
 * The same probe set as smoke/deno/main.ts, so the two runs are directly
 * comparable. The question that matters most here is whether the edge sandbox
 * grants what `@vercel/flags-core/openfeature` needs at MODULE LOAD — run 1
 * found it requires sys access to "hostname", which a sandbox may not grant.
 *
 * `/health` answers as soon as the worker is up so the vitest suite can spend
 * the cold start there. `/probe` returns the full probe set.
 */

type Probe = {
  name: string
  question: string
  status: 'ok' | 'failed' | 'blocked'
  detail?: unknown
}

const probes: Probe[] = []

const env = (k: string) => {
  try {
    return Deno.env.get(k) || undefined
  } catch (error) {
    return undefined
  }
}

// Probe 1 — @openfeature/server-sdk, which imports node:events.
let OpenFeature: any
try {
  const mod = await import('@openfeature/server-sdk')
  OpenFeature = mod.OpenFeature
  probes.push({
    name: 'openfeature-server-sdk-loads',
    question:
      'Does @openfeature/server-sdk (node:events) load in the edge sandbox?',
    status: typeof OpenFeature === 'object' ? 'ok' : 'failed',
    detail: { exportsOpenFeature: typeof OpenFeature },
  })
} catch (error) {
  probes.push({
    name: 'openfeature-server-sdk-loads',
    question:
      'Does @openfeature/server-sdk (node:events) load in the edge sandbox?',
    status: 'failed',
    detail: String(error),
  })
}

// Probe 2 — the Vercel provider. Run 1 showed this needs sys access to
// "hostname" at module load. This is the load-bearing question for the pitch.
let VercelProvider: any
try {
  const mod = await import('@vercel/flags-core/openfeature')
  VercelProvider = mod.VercelProvider
  probes.push({
    name: 'vercel-provider-loads',
    question: 'Does @vercel/flags-core/openfeature load in the edge sandbox?',
    status: typeof VercelProvider === 'function' ? 'ok' : 'failed',
    detail: { exportsVercelProvider: typeof VercelProvider },
  })
} catch (error) {
  probes.push({
    name: 'vercel-provider-loads',
    question: 'Does @vercel/flags-core/openfeature load in the edge sandbox?',
    status: 'failed',
    detail: String(error),
  })
}

// Probe 3 — process.env, which @vercel/oidc reads.
try {
  const processEnv = (globalThis as any).process?.env
  probes.push({
    name: 'process-env-available',
    question: 'Is process.env readable in the edge sandbox?',
    status: processEnv && typeof processEnv === 'object' ? 'ok' : 'failed',
    detail: { type: typeof processEnv },
  })
} catch (error) {
  probes.push({
    name: 'process-env-available',
    question: 'Is process.env readable in the edge sandbox?',
    status: 'failed',
    detail: String(error),
  })
}

// Probe 4 — this package's middleware, end to end, against a stub client.
// Needs no Vercel account.
let resolveHandler: ((req: Request) => Promise<Response>) | null = null
try {
  const { withOpenFeature } = await import('@supabase/middleware-openfeature')
  const stub = {
    getBooleanDetails: async (k: string, d: boolean) => ({
      flagKey: k,
      value: !d,
    }),
    getStringDetails: async (k: string, d: string) => ({
      flagKey: k,
      value: d,
    }),
    getNumberDetails: async (k: string, d: number) => ({
      flagKey: k,
      value: d,
    }),
    getObjectDetails: async (k: string, d: unknown) => ({
      flagKey: k,
      value: d,
    }),
  }
  resolveHandler = withOpenFeature(
    { client: stub as any, flags: { betaCheckout: false, theme: 'light' } },
    async (_req: Request, ctx: any) => Response.json(ctx.flags),
  )
  const res = await resolveHandler(new Request('http://localhost/'))
  const body = await res.json()
  probes.push({
    name: 'middleware-runs-in-edge-sandbox',
    question:
      'Does @supabase/middleware-openfeature resolve flags in the edge sandbox?',
    status:
      body.betaCheckout === true && body.theme === 'light' ? 'ok' : 'failed',
    detail: { status: res.status, body },
  })
} catch (error) {
  probes.push({
    name: 'middleware-runs-in-edge-sandbox',
    question:
      'Does @supabase/middleware-openfeature resolve flags in the edge sandbox?',
    status: 'failed',
    detail: String(error),
  })
}

// Probe 5 — credential-gated.
const hasCredential = Boolean(env('EDGE_CONFIG') || env('FLAGS'))
if (!hasCredential || typeof VercelProvider !== 'function') {
  probes.push({
    name: 'vercel-provider-initializes',
    question: 'Does VercelProvider initialize against a real Edge Config?',
    status: 'blocked',
    detail: !hasCredential
      ? 'Neither EDGE_CONFIG nor FLAGS is set in [edge_runtime.secrets].'
      : 'Provider module did not load — see probe 2.',
  })
} else {
  try {
    await OpenFeature.setProviderAndWait(new VercelProvider())
    probes.push({
      name: 'vercel-provider-initializes',
      question: 'Does VercelProvider initialize against a real Edge Config?',
      status: 'ok',
    })
  } catch (error) {
    probes.push({
      name: 'vercel-provider-initializes',
      question: 'Does VercelProvider initialize against a real Edge Config?',
      status: 'failed',
      detail: String(error),
    })
  }
}

const summary = () => ({
  runtime: `deno ${Deno.version.deno}`,
  credentials: {
    EDGE_CONFIG: Boolean(env('EDGE_CONFIG')),
    FLAGS: Boolean(env('FLAGS')),
  },
  probes,
  tally: {
    ok: probes.filter((p) => p.status === 'ok').length,
    failed: probes.filter((p) => p.status === 'failed').length,
    blocked: probes.filter((p) => p.status === 'blocked').length,
  },
})

// The gateway forwards /functions/v1/openfeature-smoke/<path> with the function
// name still in the pathname; some CLI versions strip it. Handle both.
const route = (req: Request) =>
  new URL(req.url).pathname.replace(/^\/openfeature-smoke/, '') || '/'

Deno.serve(async (req: Request) => {
  const pathname = route(req)
  if (pathname === '/health')
    return Response.json({ ok: true, runtime: `deno ${Deno.version.deno}` })
  if (pathname === '/resolve' && resolveHandler) return resolveHandler(req)
  return Response.json(summary())
})
