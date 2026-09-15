import { defineConfig } from '@playwright/test'

// Fixtures delete records. Require an explicitly selected disposable staging target
// before loading the local config (which otherwise supplies local test credentials).
if (
  process.env.HRIZONMEDIA_STAGING_TESTS !== 'true' ||
  process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
  !process.env.DATABASE_URL ||
  !process.env.PAYLOAD_SECRET
) {
  throw new Error(
    'Staging tests require explicit opt-in and isolated staging database credentials.',
  )
}
const origin = new URL(process.env.NEXT_PUBLIC_SERVER_URL ?? '')
if (origin.protocol !== 'https:' || origin.origin !== process.env.NEXT_PUBLIC_SERVER_URL) {
  throw new Error('Staging tests require NEXT_PUBLIC_SERVER_URL to be the deployed HTTPS origin.')
}

const { default: local } = await import('./playwright.config')

export default defineConfig({
  ...local,
  retries: 0,
  webServer: undefined,
  use: { ...local.use, baseURL: origin.origin },
})
