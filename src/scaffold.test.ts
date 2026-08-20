import { expect, it } from 'vitest'

import { packageName } from './index.js'

it('exports the package name', () => {
  expect(packageName).toBe('@supabase/middleware-openfeature')
})
