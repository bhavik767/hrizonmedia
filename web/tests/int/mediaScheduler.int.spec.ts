import { describe, expect, it, vi } from 'vitest'

import { runMediaSchedulerOnce } from '../../scripts/run-media-scheduler.mjs'

describe('Hetzner media scheduler', () => {
  it('runs the media queue through the authenticated Payload endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }))

    await runMediaSchedulerOnce(
      {
        cronSecret: 'scheduler-secret',
        origin: 'http://app:3000',
      },
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledWith(
      'http://app:3000/api/payload-jobs/run?queue=media-processing',
      expect.objectContaining({
        headers: { authorization: 'Bearer scheduler-secret' },
      }),
    )
  })

  it('reports a sanitized failure without exposing the secret or response body', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: 'scheduler-secret provider detail' }, { status: 503 }),
    )

    await expect(
      runMediaSchedulerOnce(
        {
          cronSecret: 'scheduler-secret',
          origin: 'http://app:3000',
        },
        fetcher,
      ),
    ).rejects.toThrow('Media scheduler request failed with status 503.')
  })
})
