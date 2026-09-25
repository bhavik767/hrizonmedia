import { readRealMediaProviderConfiguration } from './media-provider-environment.mjs'

const REQUIRED_PRODUCTION_VARIABLES = [
  'ACCESS_KEY_ID',
  'BUCKET',
  'DATABASE_URL',
  'ENDPOINT',
  'NEXT_PUBLIC_SERVER_URL',
  'PAYLOAD_SECRET',
  'SECRET_ACCESS_KEY',
  'TRANSCODER_CALLBACK_SECRET',
]

export function validateEnvironment(environment = process.env) {
  if (environment.NODE_ENV !== 'production') return

  const missing = REQUIRED_PRODUCTION_VARIABLES.filter((name) => !environment[name]?.trim())

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`)
  }

  const realMediaProviders = readRealMediaProviderConfiguration(environment)

  if (!/^postgres(?:ql)?:\/\//.test(environment.DATABASE_URL)) {
    throw new Error('DATABASE_URL must use PostgreSQL in production')
  }

  let publicURL
  try {
    publicURL = new URL(environment.NEXT_PUBLIC_SERVER_URL)
  } catch {
    throw new Error('NEXT_PUBLIC_SERVER_URL must be a valid HTTPS origin in production')
  }
  if (
    publicURL.protocol !== 'https:' ||
    publicURL.username ||
    publicURL.password ||
    publicURL.pathname !== '/' ||
    publicURL.search ||
    publicURL.hash
  ) {
    throw new Error('NEXT_PUBLIC_SERVER_URL must be a valid HTTPS origin in production')
  }

  if (!realMediaProviders && environment.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() !== 'staging') {
    throw new Error('Production Dashboard requires verified real media providers')
  }
}

try {
  validateEnvironment()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
