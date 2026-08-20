import { defineMiddleware } from '@supabase/middleware'
import type { Middleware } from '@supabase/middleware'

import type { FlagClient } from '../src/types.js'

/** Stand-in for `@supabase/server`'s claims shape. */
export type JWTClaims = { sub: string; role: string }

/**
 * Stand-in for `withClaims` from `@supabase/server`. Declared locally so the
 * type tests exercise the composition without this package depending on
 * Supabase auth.
 */
export const withClaims: Middleware<
  'jwtClaims',
  void,
  Record<never, never>,
  JWTClaims | null
> = defineMiddleware<'jwtClaims', void, Record<never, never>, JWTClaims | null>(
  {
    key: 'jwtClaims',
    run: () => async () => ({ jwtClaims: null }),
  },
)

/** A `FlagClient` that only has to typecheck — never called in a type test. */
export declare const client: FlagClient
