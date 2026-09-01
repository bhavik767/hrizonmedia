import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /*
   * One worker everywhere, not just on CI. The specs seed their fixtures
   * through the Payload Local API against a single SQLite file, and concurrent
   * writers to that file surface as "database is locked" in whichever spec
   * happened to lose the race.
   */
  workers: 1,
  /*
   * Playwright's 5s default assertion timeout is too tight for the first visit
   * to a route. The suite runs against a freshly reset database and an empty
   * Turbopack cache, so the first navigation to a page compiles it on demand —
   * `/search` has flaked here. This is headroom for a cold compile, not cover
   * for a slow page: a genuinely broken assertion still fails, just later.
   */
  expect: { timeout: 15_000 },
  /*
   * `open: 'never'` is the important half. The html reporter defaults to
   * `open: 'on-failure'`, which starts a report server and waits instead of
   * exiting — and with an agent running the suite unattended there is nobody to
   * close it, so a red test hangs the whole run. Under TDD a red test is the
   * normal case, not the exception.
   *
   * Setting CI=1 would also suppress it, but it would switch on `retries: 2` at
   * the same time and triple the cost of every genuine failure. `list` is here
   * so failures are readable in stdout without opening the report at all.
   */
  reporter: [['list'], ['html', { open: 'never' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    reuseExistingServer: true,
    /*
     * Playwright's 60s default is not enough for a cold start. `npm run test:reset`
     * now restores a prebuilt template database rather than deleting the file, so
     * this boot no longer creates the schema from nothing — but it still pays for
     * Turbopack compiling from an empty cache, and the headroom costs nothing on
     * a boot that is already fast.
     */
    timeout: 180_000,
    url: 'http://localhost:3000',
  },
})
