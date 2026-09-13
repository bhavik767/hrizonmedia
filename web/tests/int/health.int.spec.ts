import { describe, expect, it } from 'vitest'

import { GET } from '@/app/(frontend)/health/route'

describe('Railway health check', () => {
  it('reports that the web process is ready', async () => {
    const response = GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })
})
