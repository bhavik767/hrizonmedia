import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { newMediaAssetId, newPlaybackGrantId, type MediaAssetId } from '@/media/identifiers'
import {
  acquirePlaybackLicence,
  authorizePlaybackResource,
  createPlaybackGrant,
  refreshPlaybackWatermark,
} from '@/media/playback'
import { PlaybackCompatibilityError, protectedPlaybackBrowser } from '@/media/playback-browser'
import { getFakeProviders, resetFakeMediaStorage } from '@/media/providers/fake'
import config from '@/payload.config'
import type { MediaAsset, Member } from '@/payload-types'
import { getOperationalOverview, updateOperationalControls } from '@/organisations/operations'
import { cleanMediaRecords } from '../helpers/cleanMediaRecords'
import {
  cleanTestOrganisations,
  createTestOrganisation,
  createTestPlatformAdministrator,
} from '../helpers/organisations'

let payload: Payload
let owner: Member
let otherUploader: Member
let ownerOrganisationID: number
let otherOrganisationID: number

const now = new Date('2026-09-14T12:00:00.000Z')

async function cleanPlaybackRecords() {
  await cleanMediaRecords(payload)
  await cleanTestOrganisations(payload)
  await payload.delete({ collection: 'members', overrideAccess: true, where: {} })
}

async function createUploader(email: string, status: 'active' | 'disabled' = 'active') {
  return payload.create({
    collection: 'members',
    data: {
      email,
      name: email,
      password: 'uploader-password',
      status,
    },
    overrideAccess: true,
  })
}

async function createAsset(
  member: Member,
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
      organisation: member.id === owner.id ? ownerOrganisationID : otherOrganisationID,
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
    ownerOrganisationID = await createTestOrganisation(payload, owner)
    otherOrganisationID = await createTestOrganisation(payload, otherUploader)
  })

  afterAll(async () => {
    await cleanPlaybackRecords()
  })

  it('issues a fresh, traceable Leak ID with every five-minute start grant', async () => {
    const asset = await createAsset(owner)

    const first = await createPlaybackGrant(payload, owner, asset.mediaAssetId!, { now })
    const refreshed = await createPlaybackGrant(payload, owner, asset.mediaAssetId!, {
      now: new Date(now.getTime() + 299_000),
    })

    expect(first.playbackGrantId).toMatch(/^playback_/)
    expect(first.expiresAt).toBe('2026-09-14T12:05:00.000Z')
    expect(first.watermark).toMatchObject({
      issuedAt: now.toISOString(),
      leakId: expect.stringMatching(/^lk_[A-Za-z0-9_-]{16}$/),
    })
    expect(first.manifestURL).toContain(`/api/demo/playback/${first.playbackGrantId}/manifest.mpd`)
    expect(first.licenceURL).toContain(`/api/demo/playback/${first.playbackGrantId}/licence`)
    expect(refreshed.playbackGrantId).not.toBe(first.playbackGrantId)
    expect(refreshed.expiresAt).toBe('2026-09-14T12:09:59.000Z')
    expect(refreshed.watermark.leakId).not.toBe(first.watermark.leakId)

    const storedGrant = await payload.find({
      collection: 'playback-grants',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { playbackGrantId: { equals: first.playbackGrantId } },
    })
    expect(storedGrant.docs[0]).toMatchObject({
      asset: asset.id,
      leakId: first.watermark.leakId,
      owner: owner.id,
    })
    const audit = await payload.find({
      collection: 'audit-events',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        eventKey: {
          equals: `playback-grant:${first.playbackGrantId}:leak:${first.watermark.leakId}`,
        },
      },
    })
    expect(audit.docs[0]).toMatchObject({
      action: 'playback_leak_id_issued',
      actor: owner.id,
      asset: asset.id,
      details: { leakId: first.watermark.leakId, playbackGrantId: first.playbackGrantId },
    })
  })

  it('rotates the persisted Leak ID no sooner than every 30 seconds', async () => {
    const asset = await createAsset(owner)
    const grant = await createPlaybackGrant(payload, owner, asset.mediaAssetId, { now })

    await expect(
      refreshPlaybackWatermark(payload, owner, grant.playbackGrantToken, {
        now: new Date(now.getTime() + 29_999),
        requestedPlaybackGrantId: grant.playbackGrantId,
      }),
    ).resolves.toEqual(grant.watermark)

    const rotated = await refreshPlaybackWatermark(payload, owner, grant.playbackGrantToken, {
      now: new Date(now.getTime() + 30_000),
      requestedPlaybackGrantId: grant.playbackGrantId,
    })
    expect(rotated).toMatchObject({ issuedAt: '2026-09-14T12:00:30.000Z' })
    expect(rotated.leakId).not.toBe(grant.watermark.leakId)
  })

  it('selects the verified encrypted Widevine package for Chrome and Edge without HDCP gating', async () => {
    const asset = await createAsset(owner)

    const chrome = await createPlaybackGrant(payload, owner, asset.mediaAssetId!, {
      browser: protectedPlaybackBrowser(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        { fairPlayAvailable: false, playReadyAvailable: false, widevineAvailable: true },
      ),
      now,
    })
    const edge = await createPlaybackGrant(payload, owner, asset.mediaAssetId!, {
      browser: protectedPlaybackBrowser(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/126.0.0.0 Safari/537.36',
        { fairPlayAvailable: false, playReadyAvailable: false, widevineAvailable: true },
      ),
      now,
    })

    expect(chrome).toMatchObject({
      hdcpRequired: false,
      keySystem: 'com.widevine.alpha',
      manifestFormat: 'dash',
    })
    expect(chrome.manifestURL).toContain('/manifest.mpd')
    expect(edge).toMatchObject({
      hdcpRequired: false,
      keySystem: 'com.widevine.alpha',
      manifestFormat: 'dash',
    })
  })

  it('selects a FairPlay HLS package for Safari through the same temporary Playback Grant', async () => {
    const asset = await createAsset(owner)

    const safari = await createPlaybackGrant(payload, owner, asset.mediaAssetId!, {
      browser: protectedPlaybackBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
        { fairPlayAvailable: true, playReadyAvailable: false, widevineAvailable: false },
      ),
      now,
    })

    expect(safari).toMatchObject({
      fairPlayCertificateURL: expect.stringContaining('/fairplay-certificate'),
      hdcpRequired: false,
      keySystem: 'com.apple.fps',
      manifestFormat: 'hls',
      persistentState: 'not-allowed',
      sessionType: 'temporary',
    })
    expect(safari.manifestURL).toContain('/master.m3u8')
    await expect(
      acquirePlaybackLicence(payload, owner, safari.playbackGrantToken, {
        now,
        providers: getFakeProviders(),
      }),
    ).resolves.toMatchObject({ keySystem: 'com.apple.fps', manifestFormat: 'hls' })
  })

  it('rejects browsers without a verified protected-playback path before creating a grant', async () => {
    expect(() =>
      protectedPlaybackBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
        { fairPlayAvailable: false, playReadyAvailable: false, widevineAvailable: true },
      ),
    ).toThrow(PlaybackCompatibilityError)
    expect(() =>
      protectedPlaybackBrowser(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        { fairPlayAvailable: false, playReadyAvailable: false, widevineAvailable: false },
      ),
    ).toThrow(PlaybackCompatibilityError)
    expect(() =>
      protectedPlaybackBrowser(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 OPR/111.0.0.0 Safari/537.36',
        { fairPlayAvailable: false, playReadyAvailable: false, widevineAvailable: true },
      ),
    ).toThrow(PlaybackCompatibilityError)
  })

  it('blocks new playback activity while the operator kill switch is enabled', async () => {
    const asset = await createAsset(owner)
    const operator = await payload.create({
      collection: 'members',
      data: {
        email: 'playback-kill-switch-operator@example.test',
        name: 'Playback kill switch operator',
        password: 'operator-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    await createTestPlatformAdministrator(payload, operator)
    await updateOperationalControls(payload, operator, {
      killSwitchEnabled: true,
      providerConcurrency: 2,
    })

    await expect(
      createPlaybackGrant(payload, owner, asset.mediaAssetId!, { now }),
    ).rejects.toMatchObject({ status: 503 })
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

  it('denies guessed IDs, cross-Organisation access, disabled Members, and expired assets', async () => {
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
    ).rejects.toMatchObject({ status: 403 })
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

  it('rejects noncanonical signatures and trailing fields in playback tokens', async () => {
    const asset = await createAsset(owner)
    const grant = await createPlaybackGrant(payload, owner, asset.mediaAssetId, { now })
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const token = grant.deliveryToken
    const alias =
      `${token.slice(0, -1)}${alphabet[alphabet.indexOf(token.at(-1)!) + 1]}` as typeof token

    await expect(
      authorizePlaybackResource(payload, owner, alias, asset.mediaAssetId, { now }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      authorizePlaybackResource(
        payload,
        owner,
        `${token}.ignored` as typeof token,
        asset.mediaAssetId,
        { now },
      ),
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

  it('records grants and licence acquisition for operator investigation', async () => {
    const asset = await createAsset(owner)
    const grant = await createPlaybackGrant(payload, owner, asset.mediaAssetId, { now })
    await acquirePlaybackLicence(payload, owner, grant.playbackGrantToken, { now })
    const operator = await payload.create({
      collection: 'members',
      data: {
        email: 'playback-audit-operator@example.test',
        name: 'Playback audit operator',
        password: 'operator-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    await createTestPlatformAdministrator(payload, operator)

    expect(
      (await getOperationalOverview(payload, operator)).auditEvents.map(({ action }) => action),
    ).toEqual(expect.arrayContaining(['playback_granted', 'playback_licence_acquired']))
  })
})
