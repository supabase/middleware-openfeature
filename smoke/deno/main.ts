/**
 * Run 1: does `VercelProvider` resolve a real flag on Deno, with the
 * provider isolated from the Supabase edge sandbox?
 *
 * Structured as independent probes rather than one pass/fail, because the
 * credential-gated half and the runtime half fail for completely different
 * reasons and the runtime half is answerable without any Vercel account. Each
 * probe reports `ok`, `failed` or `blocked`, and the JSON it prints is the raw
 * material for docs/deno-vercel-findings.md.
 *
 * Imports the BUILT artifact (`../../dist/index.js`), not `src/`, because Deno
 * does not rewrite TypeScript's `./types.js` relative specifiers back to `.ts`.
 * Run `pnpm build` first.
 */

type Probe = {
  name: string
  question: string
  status: 'ok' | 'failed' | 'blocked'
  detail?: unknown
}

const probes: Probe[] = []
const record = (p: Probe) => {
  probes.push(p)
  return p
}

const env = (k: string) => {
  try {
    return Deno.env.get(k) || undefined
  } catch {
    return undefined
  }
}

const edgeConfig = env('EDGE_CONFIG')
const flagsEnv = env('FLAGS')
const oidcToken = env('VERCEL_OIDC_TOKEN')
const flagKey = env('SMOKE_FLAG_KEY')
// An SDK key in FLAGS is the durable path. Without one the client falls back to
// OIDC, which works while VERCEL_OIDC_TOKEN is unexpired — so either counts as
// a credential. EDGE_CONFIG does not: the default entry point does not read it.
const hasCredential = Boolean(flagsEnv || oidcToken)
const authPath = flagsEnv
  ? 'sdk-key (FLAGS)'
  : oidcToken
    ? 'oidc (VERCEL_OIDC_TOKEN)'
    : 'none'

// ---------------------------------------------------------------------------
// Probe 1 — does `@openfeature/server-sdk` load on Deno at all?
// The design doc names its `node:events` import as the first thing to check if the
// worker fails to boot. This is answerable with no credentials.
// ---------------------------------------------------------------------------
let OpenFeature: any
try {
  const mod = await import('@openfeature/server-sdk')
  OpenFeature = mod.OpenFeature
  record({
    name: 'openfeature-server-sdk-loads',
    question:
      'Does @openfeature/server-sdk (which imports node:events) load on Deno?',
    status: typeof OpenFeature === 'object' ? 'ok' : 'failed',
    detail: { exportsOpenFeature: typeof OpenFeature },
  })
} catch (error) {
  record({
    name: 'openfeature-server-sdk-loads',
    question:
      'Does @openfeature/server-sdk (which imports node:events) load on Deno?',
    status: 'failed',
    detail: String(error),
  })
}

// ---------------------------------------------------------------------------
// Probe 2 — does the Vercel provider module load?
// Its dependency chain reaches jose, whose `deno` export condition should
// resolve to a WebCrypto build with no node: imports.
// ---------------------------------------------------------------------------
let VercelProvider: any
try {
  const mod = await import('@vercel/flags-core/openfeature')
  VercelProvider = mod.VercelProvider
  record({
    name: 'vercel-provider-loads',
    question: 'Does @vercel/flags-core/openfeature load on Deno?',
    status: typeof VercelProvider === 'function' ? 'ok' : 'failed',
    detail: { exportsVercelProvider: typeof VercelProvider },
  })
} catch (error) {
  record({
    name: 'vercel-provider-loads',
    question: 'Does @vercel/flags-core/openfeature load on Deno?',
    status: 'failed',
    detail: String(error),
  })
}

// ---------------------------------------------------------------------------
// Probe 3 — is `process.env` readable? `@vercel/oidc` reads
// `process.env.VERCEL_OIDC_TOKEN`, not `Deno.env`.
// ---------------------------------------------------------------------------
try {
  const processEnv = (globalThis as any).process?.env
  record({
    name: 'process-env-available',
    question: 'Is process.env readable, as @vercel/oidc requires?',
    status: processEnv && typeof processEnv === 'object' ? 'ok' : 'failed',
    detail: { type: typeof processEnv },
  })
} catch (error) {
  record({
    name: 'process-env-available',
    question: 'Is process.env readable, as @vercel/oidc requires?',
    status: 'failed',
    detail: String(error),
  })
}

// ---------------------------------------------------------------------------
// Probe 4 — does this package's own middleware run on Deno, end to end?
// Uses a hand-rolled FlagClient, so it needs no Vercel account. This isolates
// "does @supabase/middleware-openfeature work on Deno" from "does Vercel Flags
// work on Deno", which the design doc treats as a single question.
// ---------------------------------------------------------------------------
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
  const handler = withOpenFeature(
    { client: stub as any, flags: { betaCheckout: false, theme: 'light' } },
    async (_req: Request, ctx: any) => Response.json(ctx.flags),
  )
  const res = await handler(new Request('http://localhost/'))
  const body = await res.json()
  record({
    name: 'middleware-runs-on-deno',
    question:
      'Does @supabase/middleware-openfeature itself resolve flags on Deno?',
    status:
      body.betaCheckout === true && body.theme === 'light' ? 'ok' : 'failed',
    detail: { status: res.status, body },
  })
} catch (error) {
  record({
    name: 'middleware-runs-on-deno',
    question:
      'Does @supabase/middleware-openfeature itself resolve flags on Deno?',
    status: 'failed',
    detail: String(error),
  })
}

// ---------------------------------------------------------------------------
// Probe 5 — the credential-gated half: can VercelProvider initialize?
// ---------------------------------------------------------------------------
let providerReady = false
if (!hasCredential) {
  record({
    name: 'vercel-provider-initializes',
    question: 'Does VercelProvider initialize against a real Edge Config?',
    status: 'blocked',
    detail:
      'Neither FLAGS (SDK key) nor VERCEL_OIDC_TOKEN is set. See smoke/.env.example.',
  })
} else if (typeof VercelProvider !== 'function') {
  record({
    name: 'vercel-provider-initializes',
    question: 'Does VercelProvider initialize against a real Edge Config?',
    status: 'blocked',
    detail: 'Provider module did not load — see probe 2.',
  })
} else {
  try {
    await OpenFeature.setProviderAndWait(new VercelProvider())
    providerReady = true
    record({
      name: 'vercel-provider-initializes',
      question: 'Does VercelProvider initialize against a real Edge Config?',
      status: 'ok',
    })
  } catch (error) {
    record({
      name: 'vercel-provider-initializes',
      question: 'Does VercelProvider initialize against a real Edge Config?',
      status: 'failed',
      detail: String(error),
    })
  }
}

// ---------------------------------------------------------------------------
// Probe 5b — find the flag's real type, and get `reason` on the record.
//
// This is the probe that tells a real resolution from a silent fallback.
// `ctx.flags` holds values only, by design, so a type mismatch or a missing
// flag is indistinguishable from a legitimate value at the handler. `reason` is
// the only signal:
//   TARGETING_MATCH / DEFAULT / STATIC -> the provider answered
//   ERROR + errorCode                  -> it fell back to the declared default
//
// The type is probed rather than assumed. Asking for the wrong type returns
// TYPE_MISMATCH, which is itself a fallback — so guessing boolean and calling
// the result a pass is exactly the false positive this probe exists to catch.
// ---------------------------------------------------------------------------
type Probed = { kind: string; default: unknown; details: any }

async function probeFlagType(key: string): Promise<Probed | null> {
  const client = OpenFeature.getClient()
  const attempts: Array<
    [string, unknown, (k: string, d: any) => Promise<any>]
  > = [
    ['boolean', false, (k, d) => client.getBooleanDetails(k, d)],
    ['string', '', (k, d) => client.getStringDetails(k, d)],
    ['number', 0, (k, d) => client.getNumberDetails(k, d)],
    ['object', {}, (k, d) => client.getObjectDetails(k, d)],
  ]
  let last: Probed | null = null
  for (const [kind, def, call] of attempts) {
    try {
      const details = await call(key, def)
      last = { kind, default: def, details }
      if (details.reason !== 'ERROR') return last
      if (details.errorCode !== 'TYPE_MISMATCH') return last
    } catch (error) {
      last = {
        kind,
        default: def,
        details: { reason: 'ERROR', errorMessage: String(error) },
      }
    }
  }
  return last
}

let resolved: Probed | null = null

if (!providerReady || !flagKey) {
  record({
    name: 'flag-resolves-with-reason',
    question: 'Does the provider actually answer, rather than falling back?',
    status: 'blocked',
    detail: !flagKey
      ? 'SMOKE_FLAG_KEY is not set.'
      : 'Provider did not initialize.',
  })
} else {
  resolved = await probeFlagType(flagKey)
  const d = resolved?.details
  const fellBack = !d || d.reason === 'ERROR'
  record({
    name: 'flag-resolves-with-reason',
    question: 'Does the provider actually answer, rather than falling back?',
    status: fellBack ? 'failed' : 'ok',
    detail: {
      flagKey,
      detectedType: resolved?.kind,
      value: d?.value,
      reason: d?.reason,
      variant: d?.variant,
      errorCode: d?.errorCode,
      errorMessage: d?.errorMessage,
      interpretation: fellBack
        ? 'FELL BACK to the declared default — the provider did not answer'
        : `provider answered; flag is a ${resolved?.kind} flag`,
    },
  })
}

// ---------------------------------------------------------------------------
// Probe 6 — resolve the flag through the middleware, using the type the
// provider actually reported, so the middleware dispatches to the right method.
// ---------------------------------------------------------------------------
if (
  !providerReady ||
  !flagKey ||
  !resolved ||
  resolved.details?.reason === 'ERROR'
) {
  record({
    name: 'resolves-real-flag',
    question:
      'Does a real Vercel flag resolve through withOpenFeature on Deno?',
    status: 'blocked',
    detail: !flagKey
      ? 'SMOKE_FLAG_KEY is not set.'
      : !providerReady
        ? 'Provider did not initialize.'
        : 'Flag did not resolve — see flag-resolves-with-reason.',
  })
} else {
  try {
    const { withOpenFeature } = await import('@supabase/middleware-openfeature')
    const handler = withOpenFeature(
      {
        client: OpenFeature.getClient(),
        flags: { [flagKey]: resolved.default as never },
      },
      async (_req: Request, ctx: any) => Response.json(ctx.flags),
    )
    const res = await handler(new Request('http://localhost/'))
    const body = await res.json()
    const matches =
      JSON.stringify(body[flagKey]) === JSON.stringify(resolved.details.value)
    record({
      name: 'resolves-real-flag',
      question:
        'Does a real Vercel flag resolve through withOpenFeature on Deno?',
      status: matches ? 'ok' : 'failed',
      detail: {
        status: res.status,
        body,
        matchesDirectEvaluation: matches,
        note: matches
          ? 'ctx.flags carries the same value the provider returned directly'
          : 'MISMATCH between ctx.flags and the direct evaluation',
      },
    })
  } catch (error) {
    record({
      name: 'resolves-real-flag',
      question:
        'Does a real Vercel flag resolve through withOpenFeature on Deno?',
      status: 'failed',
      detail: String(error),
    })
  }
}

const summary = {
  runtime: `deno ${Deno.version.deno}`,
  v8: Deno.version.v8,
  versions: {
    '@openfeature/server-sdk': '1.18.0',
    '@openfeature/core': '1.12.0',
    '@vercel/flags-core': '1.7.1',
    '@supabase/middleware': '0.3.0',
  },
  authPath,
  credentials: {
    EDGE_CONFIG: Boolean(edgeConfig),
    FLAGS: Boolean(flagsEnv),
    VERCEL_OIDC_TOKEN: Boolean(oidcToken),
    SMOKE_FLAG_KEY: Boolean(flagKey),
  },
  probes,
  tally: {
    ok: probes.filter((p) => p.status === 'ok').length,
    failed: probes.filter((p) => p.status === 'failed').length,
    blocked: probes.filter((p) => p.status === 'blocked').length,
  },
}

console.log(JSON.stringify(summary, null, 2))

// Exit non-zero only on a real failure. A blocked probe is a missing
// credential, not a broken runtime — the design doc treats that as a publishable
// finding rather than a failure.
Deno.exit(summary.tally.failed > 0 ? 1 : 0)
