import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const validator = path.resolve(process.cwd(), 'src/config/validate-environment.mjs')

describe('Railway environment validation', () => {
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
})
