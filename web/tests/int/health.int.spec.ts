import { getPayload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'

import { GET } from '@/app/(frontend)/health/route'

describe('Railway health check', () => {
  it('reports that the web process is ready', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('returns an uncached, sanitized failure when the database is unavailable', async () => {
    const payload = await getPayload({ config })
    const query = vi
      .spyOn(payload.db.drizzle, 'execute')
      .mockRejectedValueOnce(new Error('postgresql://secret-password@private-database'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const response = await GET()
      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toEqual({ status: 'unavailable' })
      expect(log).toHaveBeenCalledWith(expect.stringContaining('health_unavailable'))
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret-password')
    } finally {
      query.mockRestore()
      log.mockRestore()
    }
  })
})
