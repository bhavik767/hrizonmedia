const REQUIRED_PRODUCTION_VARIABLES = [
  'ACCESS_KEY_ID',
  'BUCKET',
  'DATABASE_URL',
  'ENDPOINT',
  'PAYLOAD_SECRET',
  'SECRET_ACCESS_KEY',
]

export function validateEnvironment(environment = process.env) {
  if (environment.NODE_ENV !== 'production') return

  const missing = REQUIRED_PRODUCTION_VARIABLES.filter((name) => !environment[name]?.trim())

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`)
  }

  if (!/^postgres(?:ql)?:\/\//.test(environment.DATABASE_URL)) {
    throw new Error('DATABASE_URL must use PostgreSQL in production')
  }
}

try {
  validateEnvironment()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
