import type { Client } from '@openfeature/server-sdk'

import type { FlagClient, Resolved } from '../src/types.js'

// A3 — a real OpenFeature `Client` satisfies `FlagClient` as-is, with zero
// adapter code. This is the exact check that would have caught an early
// drafting error, where we assumed `@openfeature/core` exported a server
// `Client`. It does not.
declare const real: Client
const _a3: FlagClient = real
void _a3

// A4 — `Widen` widens a literal default so a general value fits the slot.
// Without it, `flags: { beta: false }` types `ctx.flags.beta` as `false` and
// `ctx.flags.beta = someBoolean` fails.
declare const anyBool: boolean
const _a4: Resolved<{ beta: false }>['beta'] = anyBool
void _a4

// A4b — the same for string and number, so the widening is not relied on for
// booleans only.
declare const anyString: string
declare const anyNumber: number
const _a4b: Resolved<{ theme: 'light'; maxItems: 10 }> = {
  theme: anyString,
  maxItems: anyNumber,
}
void _a4b

import { pipeline } from '@supabase/middleware'
import type { FetchHandler } from '@supabase/middleware'

import { withOpenFeature } from '../src/index.js'
import { client, withClaims } from './fixtures.js'
import type { JWTClaims } from './fixtures.js'

// A1 — nesting form: the config callback's `ctx` is typed against the upstream
// with no annotation, and the handler sees both upstream and contribution.
withClaims(
  withOpenFeature(
    {
      client,
      flags: { betaCheckout: false, theme: 'light' },
      context: (_r, ctx) => ({ targetingKey: ctx.jwtClaims?.sub ?? 'anon' }),
    },
    async (_req, ctx) => {
      const _b: boolean = ctx.flags.betaCheckout
      const _t: string = ctx.flags.theme
      const _s: string | undefined = ctx.jwtClaims?.sub
      return Response.json({ _b, _t, _s })
    },
  ),
) satisfies FetchHandler

// A2 — pipeline form, config callback reading upstream. The one-line param
// annotation is the documented workaround for the evaluation-order limit in
// evaluation order; without it this is A7, which must NOT compile.
pipeline(
  [
    withClaims(),
    withOpenFeature({
      client,
      flags: { a: false },
      context: (_r, ctx: { jwtClaims: JWTClaims | null }) => ({
        targetingKey: ctx.jwtClaims?.sub ?? 'anon',
      }),
    }),
  ],
  async (_req, ctx) => Response.json({ a: ctx.flags.a }),
) satisfies FetchHandler

// A8 — pipeline composition types normally: the handler sees every upstream key
// AND the contribution, at full fidelity. This is what proves the limit is
// scoped to the config callback and is not a `pipeline` defect.
pipeline(
  [
    withClaims(),
    withOpenFeature({ client, flags: { betaCheckout: false, theme: 'light' } }),
  ],
  async (_req, ctx) => {
    const _b: boolean = ctx.flags.betaCheckout
    const _t: string = ctx.flags.theme
    const _s: string | undefined = ctx.jwtClaims?.sub
    return Response.json({ _b, _t, _s })
  },
) satisfies FetchHandler

// A9 — pipeline form with a config callback that ignores upstream ctx: no
// annotation needed. The cost in A2 is narrow, and this is the proof.
pipeline(
  [
    withClaims(),
    withOpenFeature({
      client,
      flags: { a: false },
      context: (req) => ({ targetingKey: req.headers.get('x-user') ?? 'anon' }),
    }),
  ],
  async (_req, ctx) => Response.json({ a: ctx.flags.a }),
) satisfies FetchHandler

// A12 — standalone, no upstream: the produced stack is a `fetch` export on its
// own, because `In` is empty and `ctx` is therefore optional.
withOpenFeature({ client, flags: { a: false } }, async (_req, ctx) =>
  Response.json({ a: ctx.flags.a }),
) satisfies FetchHandler

// A13 — propagation probe. The inner handler declares an
// upstream requirement this layer does not contribute, and the stack is built
// WITHOUT an anchor, so `Base` collapses to its constraint and the requirement
// must travel outward instead. The engine models this with a third overload.
const _a13Unanchored = withOpenFeature(
  { client, flags: { a: false } },
  async (
    _req,
    ctx: { jwtClaims: JWTClaims | null; flags: { a: boolean } },
  ): Promise<Response> =>
    Response.json({ sub: ctx.jwtClaims?.sub, a: ctx.flags.a }),
)

// …and wrapping it in the contributor must then discharge the requirement.
withClaims(_a13Unanchored) satisfies FetchHandler

import { withSupabase } from '@supabase/server'
import type {
  AuthMode,
  JWTClaims as ServerClaims,
  SupabaseContext,
} from '@supabase/server'

// `@supabase/server` is a devDependency for the cases below only. They pin
// that this package composes with `withSupabase` in both call forms, with
// `withSupabase` as a `pipeline` entry, without depending on Supabase auth.
const serverEnv = {
  url: 'https://test.supabase.co',
  publishableKeys: { default: 'sb_publishable_xyz' },
  secretKeys: { default: 'sb_secret_xyz' },
  jwks: null,
}

// S1 — pipeline: `withSupabase` as an entry supplies the keys the callback
// annotates, and the handler sees both packages' contributions.
pipeline(
  [
    withSupabase({ auth: 'user', env: serverEnv }),
    withOpenFeature({
      client,
      flags: { beta: false },
      context: (_r, ctx: { jwtClaims: ServerClaims | null }) => ({
        targetingKey: ctx.jwtClaims?.sub ?? 'anon',
      }),
    }),
  ],
  async (_req, ctx) => {
    const _b: boolean = ctx.flags.beta
    const _m: AuthMode = ctx.authMode
    const _s: string | undefined = ctx.jwtClaims?.sub
    void ctx.supabase.from
    return Response.json({ _b, _m, _s })
  },
) satisfies FetchHandler

// S2 — nested: the composite context reaches the callback through the same
// annotation the pipeline form needs, and the handler then sees both packages'
// keys. Without it neither does (NS3 in negative.ts): `withSupabase` infers
// `Database` from its handler argument, so the contextual type handed to the
// inner call still carries an unfixed type parameter, and `Base` does not
// travel through it. S2b shows the other way out.
withSupabase(
  { auth: 'user', env: serverEnv },
  withOpenFeature(
    {
      client,
      flags: { beta: false },
      context: (_r, ctx: SupabaseContext) => ({
        targetingKey: ctx.jwtClaims?.sub ?? ctx.authMode,
      }),
    },
    async (_req, ctx) =>
      Response.json({ beta: ctx.flags.beta, mode: ctx.authMode }),
  ),
) satisfies FetchHandler

// S2b — fixing `Database` explicitly restores the cascade with nothing
// annotated in the inner call.
withSupabase<unknown>(
  { auth: 'user', env: serverEnv },
  withOpenFeature(
    {
      client,
      flags: { beta: false },
      context: (_r, ctx) => ({
        targetingKey: ctx.jwtClaims?.sub ?? ctx.authMode,
      }),
    },
    async (_req, ctx) =>
      Response.json({ beta: ctx.flags.beta, mode: ctx.authMode }),
  ),
) satisfies FetchHandler

// S3 — flags ahead of the gate: position is the contract, and the handler
// still sees both.
pipeline(
  [
    withOpenFeature({ client, flags: { beta: false } }),
    withSupabase({ auth: 'user', env: serverEnv }),
  ],
  async (_req, ctx) =>
    Response.json({ beta: ctx.flags.beta, sub: ctx.jwtClaims?.sub }),
) satisfies FetchHandler

import type { Middleware } from '@supabase/middleware'

import { createWithOpenFeature } from '../src/index.js'

// `createWithOpenFeature` cases. The `ctx` type the `context` callback declares
// is the middleware's prerequisite, so `withClaims` must run first.
const withFlags = createWithOpenFeature({
  client,
  flags: { betaCheckout: false, theme: 'light', maxItems: 10 },
  context: (_r, ctx: { jwtClaims: JWTClaims | null }) => ({
    targetingKey: ctx.jwtClaims?.sub ?? 'anon',
  }),
})

// F1 — nested: the provider discharges the prerequisite, and the handler sees
// its key and `ctx.flags`, each flag widened from its default.
withClaims(
  withFlags(async (_req, ctx) => {
    const _b: boolean = ctx.flags.betaCheckout
    const _t: string = ctx.flags.theme
    const _n: number = ctx.flags.maxItems
    const _s: string | undefined = ctx.jwtClaims?.sub
    return Response.json({ _b, _t, _n, _s })
  }),
) satisfies FetchHandler

// F2 — pipeline: the same middleware as an entry, nothing annotated at the call.
pipeline([withClaims(), withFlags()], async (_req, ctx) => {
  const _b: boolean = ctx.flags.betaCheckout
  const _t: string = ctx.flags.theme
  const _n: number = ctx.flags.maxItems
  const _s: string | undefined = ctx.jwtClaims?.sub
  return Response.json({ _b, _t, _n, _s })
}) satisfies FetchHandler

// F3 — the factory returns the engine's own type, exactly.
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
const _f3: Equals<
  typeof withFlags,
  Middleware<
    'flags',
    void,
    { jwtClaims: JWTClaims | null },
    Resolved<{ betaCheckout: false; theme: 'light'; maxItems: 10 }>
  >
> = true
void _f3

// F4 — with no `context`, or one that reads only the request, there is no
// prerequisite and the middleware stands alone in both forms.
const withPlainFlags = createWithOpenFeature({ client, flags: { a: false } })
withPlainFlags(async (_req, ctx) =>
  Response.json({ a: ctx.flags.a }),
) satisfies FetchHandler
pipeline([withPlainFlags()], async (_req, ctx) =>
  Response.json({ a: ctx.flags.a }),
) satisfies FetchHandler

const withRequestFlags = createWithOpenFeature({
  client,
  flags: { a: false },
  context: (req) => ({ targetingKey: req.headers.get('x-user') ?? 'anon' }),
})
withRequestFlags(async (_req, ctx) =>
  Response.json({ a: ctx.flags.a }),
) satisfies FetchHandler

// FS1 — `withSupabase` provides the keys the callback declares, as a `pipeline`
// entry and as the outer layer.
const withServerFlags = createWithOpenFeature({
  client,
  flags: { beta: false },
  context: (
    _r,
    ctx: { jwtClaims: ServerClaims | null; authMode: AuthMode },
  ) => ({ targetingKey: ctx.jwtClaims?.sub ?? ctx.authMode }),
})

pipeline(
  [withSupabase({ auth: 'user', env: serverEnv }), withServerFlags()],
  async (_req, ctx) => {
    const _b: boolean = ctx.flags.beta
    const _m: AuthMode = ctx.authMode
    void ctx.supabase.from
    return Response.json({ _b, _m })
  },
) satisfies FetchHandler

withSupabase(
  { auth: 'user', env: serverEnv },
  withServerFlags(async (_req, ctx) => {
    const _b: boolean = ctx.flags.beta
    const _m: AuthMode = ctx.authMode
    void ctx.supabase.from
    return Response.json({ _b, _m })
  }),
) satisfies FetchHandler
