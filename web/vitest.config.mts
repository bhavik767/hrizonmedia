import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    /*
     * The suite is meant to run against a freshly reset database, and the first
     * `getPayload()` in a `beforeAll` creates the entire schema before it
     * resolves. That takes well over Vitest's 10s default on a cold file — it
     * is ~1s once the database exists.
     */
    hookTimeout: 120_000,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
  },
})
