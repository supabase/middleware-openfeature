import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['smoke/edge/**/*.smoke.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
})
