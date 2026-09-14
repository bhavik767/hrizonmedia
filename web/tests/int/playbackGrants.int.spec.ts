import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { newMediaAssetId, newPlaybackGrantId, type MediaAssetId } from '@/media/identifiers'
import {
  acquirePlaybackLicence,
  authorizePlaybackResource,
  createPlaybackGrant,
} from '@/media/playback'
import { getFakeProviders, resetFakeMediaStorage } from '@/media/providers/fake'
import config from '@/payload.config'
import type { MediaAsset, PilotMember } from '@/payload-types'
import { cleanMediaRecords } from '../helpers/cleanMediaRecords'

let payload: Payload
let owner: PilotMember
let otherUploader: PilotMember

const now = new Date('2026-09-14T12:00:00.000Z')

async function cleanPlaybackRecords() {
  await cleanMediaRecords(payload)
  await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
}

async function createUploader(email: string, status: 'active' | 'disabled' = 'active') {
  return payload.create({
    collection: 'pilot-members',
    data: {
      email,
      invitationAcceptedAt: now.toISOString(),
      name: email,
      password: 'uploader-password',
      role: 'uploader',
      status,
    },
    overrideAccess: true,
  })
}

async function createAsset(
  member: PilotMember,
  status: MediaAsset['status'] = 'ready',
  expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
): Promise<MediaAsset & { mediaAssetId: MediaAssetId }> {
  return payload.create({
    collection: 'media-assets',
    data: {
      drmContentId: `drm_${crypto.randomUUID()}`,
      expiresAt: expiresAt.toISOString(),
      fileName: 'private-lesson.mp4',
      mediaAssetId: newMediaAssetId(),
      mimeType: 'video/mp4',
      owner: member.id,
      size: 1024,
      status,
      statusChangedAt: now.toISOString(),
    },
    overrideAccess: true,
  }) as Promise<MediaAsset & { mediaAssetId: MediaAssetId }>
}

describe('Playback Grant authorization', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    resetFakeMediaStorage()
    await cleanPlaybackRecords()
    owner = await createUploader('playback-owner@example.test')
    otherUploader = await createUploader('other-playback-owner@example.test')
  })

  afterAll(async () => {
    await cleanPlaybackRecords()
  })

  it('issues a fresh five-minute start grant after each ownership check', async () => {
    const asset = await createAsset(owner)

    const first = await createPlaybackGrant(payload, owner, asset.mediaAssetId!, { now })
    const refreshed = await createPlaybackGrant(payload, owner, asset.mediaAssetId!, {
      now: new Date(now.getTime() + 299_000),
    })

    expect(first.playbackGrantId).toMatch(/^playback_/)
    expect(first.expiresAt).toBe('2026-09-14T12:05:00.000Z')
    expect(first.manifestURL).toContain(`/api/demo/playback/${first.playbackGrantId}/manifest.mpd`)
    expect(first.licenceURL).toContain(`/api/demo/playback/${first.playbackGrantId}/licence`)
    expect(refreshed.playbackGrantId).not.toBe(first.playbackGrantId)
    expect(refreshed.expiresAt).toBe('2026-09-14T12:09:59.000Z')
  })

  it.each(['uploading', 'queued', 'processing', 'failed', 'expired', 'deleted'] as const)(
    'denies a %s Media Asset',
    async (status) => {
      const asset = await createAsset(owner, status)

      await expect(
        createPlaybackGrant(payload, owner, asset.mediaAssetId!, { now }),
      ).rejects.toMatchObject({ status: status === 'deleted' ? 404 : 409 })
    },
  )

  it('denies guessed IDs, cross-member access, disabled members, and expired assets', async () => {
    const asset = await createAsset(owner)
    const expiredAsset = await createAsset(owner, 'ready', new Date(now.getTime() - 1))
    const boundaryAsset = await createAsset(owner, 'ready', now)
    const missingExpiryAsset = await createAsset(owner)
    await payload.update({
      collection: 'media-assets',
      data: { expiresAt: null },
      id: missingExpiryAsset.id,
      overrideAccess: true,
    })
    const disabledOwner = await createUploader('disabled-playback-owner@example.test', 'disabled')

    await expect(
      createPlaybackGrant(payload, otherUploader, asset.mediaAssetId!, { now }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      createPlaybackGrant(payload, owner, newMediaAssetId(), { now }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      createPlaybackGrant(payload, owner, expiredAsset.mediaAssetId!, { now }),
    ).rejects.toMatchObject({ status: 410 })
    await expect(
      createPlaybackGrant(payload, owner, boundaryAsset.mediaAssetId, { now }),
    ).rejects.toMatchObject({ status: 410 })
    await expect(
      createPlaybackGrant(payload, owner, missingExpiryAsset.mediaAssetId, { now }),
    ).rejects.toMatchObject({ status: 410 })
    await expect(
      createPlaybackGrant(payload, disabledOwner, asset.mediaAssetId!, { now }),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('keeps delivery temporary and asset-scoped while limiting new licences to five minutes', async () => {
    const asset = await createAsset(owner)
    const otherAsset = await createAsset(owner)
    const grant = await createPlaybackGrant(payload, owner, asset.mediaAssetId!, { now })

    await expect(
      acquirePlaybackLicence(payload, owner, grant.playbackGrantToken, {
        now: new Date(now.getTime() + 299_999),
      }),
    ).resolves.toMatchObject({
      distinctiveIdentifier: 'not-allowed',
      persistentState: 'not-allowed',
      sessionType: 'temporary',
    })
    await expect(
      acquirePlaybackLicence(payload, owner, grant.playbackGrantToken, {
        now: new Date(now.getTime() + 300_001),
      }),
    ).rejects.toMatchObject({ status: 401 })

    await expect(
      authorizePlaybackResource(payload, owner, grant.deliveryToken, asset.mediaAssetId!, {
        now: new Date(now.getTime() + 2 * 60 * 60 * 1000 + 299_999),
      }),
    ).resolves.toMatchObject({ mediaAssetId: asset.mediaAssetId })
    await expect(
      authorizePlaybackResource(payload, owner, grant.deliveryToken, otherAsset.mediaAssetId!, {
        now,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      authorizePlaybackResource(payload, otherUploader, grant.deliveryToken, asset.mediaAssetId!, {
        now,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      authorizePlaybackResource(payload, owner, grant.deliveryToken, asset.mediaAssetId!, {
        now: new Date(now.getTime() + 2 * 60 * 60 * 1000 + 300_001),
      }),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('rejects tampered grant and delivery tokens', async () => {
    const asset = await createAsset(owner)
    const grant = await createPlaybackGrant(payload, owner, asset.mediaAssetId!, { now })
    const tamper = <Token extends string>(token: Token) =>
      `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}` as Token

    await expect(
      acquirePlaybackLicence(payload, owner, tamper(grant.playbackGrantToken), { now }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      authorizePlaybackResource(payload, owner, tamper(grant.deliveryToken), asset.mediaAssetId!, {
        now,
      }),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('rejects a guessed licence route ID before asking the DRM provider for a licence', async () => {
    const asset = await createAsset(owner)
    const grant = await createPlaybackGrant(payload, owner, asset.mediaAssetId, { now })
    const providers = getFakeProviders()
    const acquireTemporaryLicence = vi.fn(providers.drm.acquireTemporaryLicence)
    providers.drm = { ...providers.drm, acquireTemporaryLicence }

    await expect(
      acquirePlaybackLicence(payload, owner, grant.playbackGrantToken, {
        now,
        providers,
        requestedPlaybackGrantId: newPlaybackGrantId(),
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(acquireTemporaryLicence).not.toHaveBeenCalled()
  })
})
