import type { Client } from '@openfeature/server-sdk'

import type { FlagClient, Resolved } from '../src/types.js'

// A3 — a real OpenFeature `Client` satisfies `FlagClient` as-is, with zero
// adapter code (design §2.4). This is the exact check that would have caught
// the §2.3 error, where an earlier draft assumed `@openfeature/core` exported
// a server `Client`.
declare const real: Client
const _a3: FlagClient = real
void _a3

// A4 — `Widen` widens a literal default so a general value fits the slot.
// Without it, `flags: { beta: false }` types `ctx.flags.beta` as `false` and
// `ctx.flags.beta = someBoolean` fails (design §2.6).
declare const anyBool: boolean
const _a4: Resolved<{ beta: false }>['beta'] = anyBool
void _a4

// A4b — the same for string and number, so the widening is not relied on for
// booleans only (design §4.3).
declare const anyString: string
declare const anyNumber: number
const _a4b: Resolved<{ theme: 'light'; maxItems: 10 }> = {
  theme: anyString,
  maxItems: anyNumber,
}
void _a4b
