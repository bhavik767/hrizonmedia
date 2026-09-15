import { bucket, defineRailway, postgres, preserve, project, service, volume } from 'railway/iac'

export default defineRailway((ctx) => {
  if (!ctx.isEnvironment('staging')) {
    throw new Error('This infrastructure definition is restricted to isolated staging.')
  }
  const PostgresRGHC = postgres('Postgres-RGHC', { region: 'iad' })
  PostgresRGHC.networking = { privateNetworkEndpoint: 'postgres-rghc' }
  const postgresVolumeHwlB = volume('postgres-volume-hwlB', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'iad',
    sizeMB: 500,
  })
  const hrizonmediaStagingCms = bucket('hrizonmedia-staging-cms', { region: 'sin' })
  const hrizonmediaStagingWeb = service('hrizonmedia-staging-web', {
    rootDirectory: '/web',
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile', watchPatterns: ['/web/**'] },
    deploy: {
      sleepApplication: false,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 3,
    },
    healthcheck: '/health',
    healthcheckTimeout: 180,
    replicas: { iad: 1 },
    env: {
      ACCESS_KEY_ID: preserve(),
      AWS_S3_URL_STYLE: 'path',
      BUCKET: preserve(),
      CRON_SECRET: preserve(),
      DATABASE_URL: PostgresRGHC.env.DATABASE_URL,
      ENDPOINT: preserve(),
      HRIZONMEDIA_DEMO_ENABLED: 'true',
      MEDIA_PROVIDER_CONCURRENCY: '2',
      NEXT_PUBLIC_SERVER_URL: 'https://hrizonmedia-staging-web-staging.up.railway.app',
      PAYLOAD_SECRET: preserve(),
      REGION: preserve(),
      SECRET_ACCESS_KEY: preserve(),
      TRANSCODER_CALLBACK_SECRET: preserve(),
    },
  })

  return project('hrizonmedia', {
    resources: [PostgresRGHC, hrizonmediaStagingWeb, postgresVolumeHwlB, hrizonmediaStagingCms],
  })
})
