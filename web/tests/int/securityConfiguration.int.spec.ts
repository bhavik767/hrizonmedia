import { describe, expect, it } from 'vitest'

import config from '@/payload.config'

describe('Demo browser security configuration', () => {
  it('restricts Payload browser access and hardens Pilot Member cookies', async () => {
    const resolved = await config
    const pilotMembers = resolved.collections.find(({ slug }) => slug === 'pilot-members')

    expect(resolved.cors).toEqual([expect.stringMatching(/^https?:\/\//)])
    expect(resolved.csrf).toEqual(resolved.cors)
    expect(pilotMembers?.auth).toMatchObject({
      cookies: { sameSite: 'Strict', secure: false },
    })
  })
})
