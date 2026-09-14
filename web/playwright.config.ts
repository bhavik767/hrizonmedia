import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import { config } from 'dotenv'

config({ path: 'test.env' })

const demoFlag = process.env.HRIZONMEDIA_DEMO_ENABLED === 'false' ? 'false' : 'true'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Payload fixture setup shares one disposable local database. */
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['list'], ['html', { open: 'never' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:3103',

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
    command: 'node node_modules/next/dist/bin/next dev -p 3103',
    env: { HRIZONMEDIA_DEMO_ENABLED: demoFlag, NODE_OPTIONS: '--no-deprecation' },
    reuseExistingServer: false,
    timeout: 180_000,
    url: 'http://127.0.0.1:3103',
  },
})
