import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    /*
     * The first `getPayload()` in a `beforeAll` has to connect before it
     * resolves, and on a database with no schema that means creating the whole
     * schema first — well over Vitest's 10s default, against ~1s once the
     * tables exist. `npm run test:reset` now restores a prebuilt template so
     * the tables always do exist, but the timeout stays: the one run that
     * rebuilds the template still pays the cold cost, and headroom on a hook
     * that finishes in a second costs nothing.
     */
    hookTimeout: 120_000,
    /*
     * One SQLite file, one writer. Vitest runs test files in parallel by
     * default, so a second integration file means two processes pushing the
     * schema into the same fresh database at once and one of them losing with
     * `database is locked`. Playwright pins `workers: 1` for the same reason.
     */
    fileParallelism: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
  },
})
