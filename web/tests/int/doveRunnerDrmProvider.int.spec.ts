import { createDecipheriv, createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { newPlaybackGrantId } from '@/media/identifiers'
import { createDoveRunnerDrmProvider } from '@/media/providers/doverunner'
import { getMediaProviders } from '@/media/providers'
import { PermanentTranscodeError } from '@/media/providers/errors'

const siteKey = '0123456789abcdef0123456789abcdef'
const accessKey = 'dove-runner-access-key'

function decodeProviderToken(token: string) {
  const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8')) as {
    cid: string
    drm_type: string
    hash: string
    policy: string
    site_id: string
    timestamp: string
    user_id: string
  }
  const decipher = createDecipheriv(
    'aes-256-cbc',
    Buffer.from(siteKey, 'utf8'),
    Buffer.from('0123456789abcdef', 'utf8'),
  )
  const policy = JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(decoded.policy, 'base64')), decipher.final()]).toString(
      'utf8',
    ),
  )
  return { policy, token: decoded }
}

describe('DoveRunner DRM provider', () => {
  it('selects the real DRM adapter without constructing a prohibited fake in production', () => {
    const providers = getMediaProviders({
      DOVERUNNER_ACCESS_KEY: accessKey,
      DOVERUNNER_SITE_ID: 'GXIW',
      DOVERUNNER_SITE_KEY: siteKey,
      NEXT_PUBLIC_SERVER_URL: 'https://staging.example.test',
      NODE_ENV: 'production',
      RAILWAY_ENVIRONMENT_NAME: 'production',
      SALAD_API_KEY: 'salad-api-key',
      SALAD_ORGANIZATION_NAME: 'hrizonmedia',
      SALAD_PROJECT_NAME: 'hrizonmedia-staging',
      SALAD_QUEUE_NAME: 'video-transcoding',
      SALAD_WEBHOOK_SECRET: 'salad-webhook-secret',
      VIDEO_CLOUDFRONT_DOMAIN: 'media.example.test',
      VIDEO_CLOUDFRONT_KEY_PAIR_ID: 'key-pair',
      VIDEO_CLOUDFRONT_PRIVATE_KEY: 'private-key',
      VIDEO_S3_ACCESS_KEY_ID: 'video-access',
      VIDEO_S3_BUCKET: 'private-video',
      VIDEO_S3_REGION: 'ap-south-1',
      VIDEO_S3_SECRET_ACCESS_KEY: 'video-secret',
    })

    expect(providers.drm.createPlaybackContract({ playbackGrantId: newPlaybackGrantId() })).toMatchObject({
      keySystem: 'com.widevine.alpha',
      persistentState: 'not-allowed',
      sessionType: 'temporary',
    })
  })

  it('rejects a malformed DRM Content ID before a provider request', async () => {
    const fetch = vi.fn()
    const drm = createDoveRunnerDrmProvider(
      { accessKey, siteId: 'GXIW', siteKey },
      { fetch: fetch as typeof globalThis.fetch },
    )

    await expect(
      drm.acquireTemporaryLicence({
        challenge: Uint8Array.from([1]),
        drmContentId: 'copied-content-id',
        playbackGrantId: newPlaybackGrantId(),
      }),
    ).rejects.toBeInstanceOf(PermanentTranscodeError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('proxies a Widevine challenge with a just-in-time nonpersistent streaming policy', async () => {
    const challenge = Uint8Array.from([1, 2, 3, 4])
    const grant = newPlaybackGrantId()
    const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(Uint8Array.from([9, 8, 7])),
    )
    const drm = createDoveRunnerDrmProvider(
      {
        accessKey,
        siteId: 'GXIW',
        siteKey,
      },
      { fetch, now: () => new Date('2026-09-17T12:00:00.000Z') },
    )

    await expect(
      drm.acquireTemporaryLicence({
        challenge,
        drmContentId: 'drm_processing_00000000-0000-4000-8000-000000000000',
        playbackGrantId: grant,
      }),
    ).resolves.toEqual(Uint8Array.from([9, 8, 7]))

    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe(
      'https://drm-license.doverunner.com/ri/licenseManager.do?response_format=original',
    )
    expect(init).toMatchObject({
      body: challenge,
      headers: { 'content-type': 'application/octet-stream' },
      method: 'POST',
    })
    const customData = new Headers(init?.headers).get('pallycon-customdata-v2')
    expect(customData).toBeTruthy()
    const { policy, token } = decodeProviderToken(customData!)
    expect(token).toMatchObject({
      cid: 'drm_processing_00000000-0000-4000-8000-000000000000',
      drm_type: 'Widevine',
      site_id: 'GXIW',
      timestamp: '2026-09-17T12:00:00Z',
      user_id: grant,
    })
    expect(token.hash).toBe(
      createHash('sha256')
        .update(`${accessKey}${token.drm_type}${token.site_id}${token.user_id}${token.cid}${token.policy}${token.timestamp}`)
        .digest('base64'),
    )
    expect(policy).toEqual({
      playback_policy: { license_duration: 0, persistent: false },
      policy_version: 2,
    })
  })
})
