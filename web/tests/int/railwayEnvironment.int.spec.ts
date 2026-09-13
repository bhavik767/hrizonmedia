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
      'Missing required production environment variables: ACCESS_KEY_ID, BUCKET, DATABASE_URL, ENDPOINT, PAYLOAD_SECRET, SECRET_ACCESS_KEY',
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
        PATH: process.env.PATH,
        PAYLOAD_SECRET: 'payload-secret',
        SECRET_ACCESS_KEY: 'secret-key',
      },
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('DATABASE_URL must use PostgreSQL in production')
  })
})
