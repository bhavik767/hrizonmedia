import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const validator = path.resolve(process.cwd(), 'src/config/validate-environment.mjs')
const dockerfile = path.resolve(process.cwd(), 'Dockerfile')

describe('Railway environment validation', () => {
  it('packages the validator and its media-provider dependency in the production image', () => {
    const dockerfileContents = readFileSync(dockerfile, 'utf8')

    expect(dockerfileContents).toContain(
      'COPY --from=builder --chown=nextjs:nodejs /app/src/config/validate-environment.mjs ./validate-environment.mjs',
    )
    expect(dockerfileContents).toContain(
      'COPY --from=builder --chown=nextjs:nodejs /app/src/config/media-provider-environment.mjs ./media-provider-environment.mjs',
    )
  })

  it('stops production startup with a useful list of missing variables', () => {
    const result = spawnSync(process.execPath, [validator], {
      encoding: 'utf8',
      env: { NODE_ENV: 'production', PATH: process.env.PATH },
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Missing required production environment variables: ACCESS_KEY_ID, BUCKET, DATABASE_URL, ENDPOINT, NEXT_PUBLIC_SERVER_URL, PAYLOAD_SECRET, SECRET_ACCESS_KEY, TRANSCODER_CALLBACK_SECRET',
    )
  })

  it('rejects a non-PostgreSQL production database', () => {
    const result = spawnSync(process.execPath, [validator], {
      encoding: 'utf8',
      env: {
        ACCESS_KEY_ID: 'access-key',
        BUCKET: 'cms-media',
        DATABASE_URL: 'file:./local.db',
        ENDPOINT: 'https://storage.example.test',
        NODE_ENV: 'production',
        NEXT_PUBLIC_SERVER_URL: 'https://hrizonmedia.example.test',
        PATH: process.env.PATH,
        PAYLOAD_SECRET: 'payload-secret',
        SECRET_ACCESS_KEY: 'secret-key',
        TRANSCODER_CALLBACK_SECRET: 'callback-secret',
      },
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('DATABASE_URL must use PostgreSQL in production')
  })

  it('refuses to expose the Demo with fake providers in production', () => {
    const result = spawnSync(process.execPath, [validator], {
      encoding: 'utf8',
      env: {
        ACCESS_KEY_ID: 'access-key',
        BUCKET: 'cms-media',
        DATABASE_URL: 'postgresql://database.example.test/hrizonmedia',
        ENDPOINT: 'https://storage.example.test',
        HRIZONMEDIA_DEMO_ENABLED: 'true',
        NODE_ENV: 'production',
        NEXT_PUBLIC_SERVER_URL: 'https://hrizonmedia.example.test',
        PATH: process.env.PATH,
        PAYLOAD_SECRET: 'payload-secret',
        RAILWAY_ENVIRONMENT_NAME: 'production',
        SECRET_ACCESS_KEY: 'secret-key',
        TRANSCODER_CALLBACK_SECRET: 'callback-secret',
      },
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'The production Demo cannot start with deterministic fake media providers',
    )
  })

  it('rejects a partial real storage and delivery configuration', () => {
    const result = spawnSync(process.execPath, [validator], {
      encoding: 'utf8',
      env: {
        ACCESS_KEY_ID: 'access-key',
        BUCKET: 'cms-media',
        DATABASE_URL: 'postgresql://database.example.test/hrizonmedia',
        ENDPOINT: 'https://storage.example.test',
        NODE_ENV: 'production',
        NEXT_PUBLIC_SERVER_URL: 'https://hrizonmedia.example.test',
        PATH: process.env.PATH,
        PAYLOAD_SECRET: 'payload-secret',
        SECRET_ACCESS_KEY: 'secret-key',
        TRANSCODER_CALLBACK_SECRET: 'callback-secret',
        VIDEO_S3_BUCKET: 'private-video',
      },
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Real media providers are partially configured')
    expect(result.stderr).toContain('VIDEO_S3_ACCESS_KEY_ID')
  })

  it('requires the Salad queue and webhook configuration with the real media providers', () => {
    const result = spawnSync(process.execPath, [validator], {
      encoding: 'utf8',
      env: {
        ACCESS_KEY_ID: 'access-key',
        BUCKET: 'cms-media',
        DATABASE_URL: 'postgresql://database.example.test/hrizonmedia',
        ENDPOINT: 'https://storage.example.test',
        NODE_ENV: 'production',
        NEXT_PUBLIC_SERVER_URL: 'https://hrizonmedia.example.test',
        PATH: process.env.PATH,
        PAYLOAD_SECRET: 'payload-secret',
        SECRET_ACCESS_KEY: 'secret-key',
        TRANSCODER_CALLBACK_SECRET: 'callback-secret',
        VIDEO_CLOUDFRONT_DOMAIN: 'media.example.test',
        VIDEO_CLOUDFRONT_KEY_PAIR_ID: 'key-pair',
        VIDEO_CLOUDFRONT_PRIVATE_KEY: 'private-key',
        VIDEO_S3_ACCESS_KEY_ID: 'video-access',
        VIDEO_S3_BUCKET: 'private-video',
        VIDEO_S3_REGION: 'ap-south-1',
        VIDEO_S3_SECRET_ACCESS_KEY: 'video-secret',
      },
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('SALAD_API_KEY')
    expect(result.stderr).toContain('SALAD_QUEUE_NAME')
    expect(result.stderr).toContain('SALAD_WEBHOOK_SECRET')
    expect(result.stderr).toContain('DOVERUNNER_SITE_ID')
    expect(result.stderr).toContain('DOVERUNNER_SITE_KEY')
    expect(result.stderr).toContain('DOVERUNNER_ACCESS_KEY')
  })
})
