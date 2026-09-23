import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  newMediaAssetId,
  newProcessingJobId,
  newUploadSessionId,
  type MediaAssetId,
} from '@/media/identifiers'
import { deleteMediaAsset, runMediaLifecycle } from '@/media/lifecycle'
import { getVisibleAsset, listVisibleAssets } from '@/media/library'
import { createPlaybackGrant } from '@/media/playback'
import { getFakeProviders, resetFakeMediaStorage } from '@/media/providers/fake'
import config from '@/payload.config'
import type { MediaAsset, Member } from '@/payload-types'
import { cleanMediaRecords } from '../helpers/cleanMediaRecords'
import {
  cleanTestOrganisations,
  createTestOrganisation,
  createTestPlatformAdministrator,
} from '../helpers/organisations'

let payload: Payload
let operator: Member
let owner: Member
let otherUploader: Member
const organisationIDs = new Map<number, number>()

const now = new Date('2026-09-15T12:00:00.000Z')

async function createMember(email: string) {
  return payload.create({
    collection: 'members',
    data: {
      email,
      name: email,
      password: 'member-password',
      status: 'active',
    },
    overrideAccess: true,
  })
}

async function createReadyAsset(
  member: Member,
): Promise<MediaAsset & { mediaAssetId: MediaAssetId }> {
  return payload.create({
    collection: 'media-assets',
    data: {
      drmContentId: `drm_${crypto.randomUUID()}`,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      fileName: 'retained-lesson.mp4',
      mediaAssetId: newMediaAssetId(),
      mimeType: 'video/mp4',
      organisation: organisationIDs.get(member.id)!,
      owner: member.id,
      size: 1024,
      status: 'ready',
      statusChangedAt: now.toISOString(),
    },
    overrideAccess: true,
  }) as Promise<MediaAsset & { mediaAssetId: MediaAssetId }>
}

async function cleanLifecycleRecords() {
  await cleanMediaRecords(payload)
  await cleanTestOrganisations(payload)
  await payload.delete({ collection: 'members', overrideAccess: true, where: {} })
}

describe('Media Asset lifecycle', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    resetFakeMediaStorage()
    await cleanLifecycleRecords()
    operator = await createMember('lifecycle-operator@example.test')
    owner = await createMember('lifecycle-owner@example.test')
    otherUploader = await createMember('lifecycle-other@example.test')
    organisationIDs.set(operator.id, await createTestOrganisation(payload, operator))
    organisationIDs.set(owner.id, await createTestOrganisation(payload, owner))
    organisationIDs.set(otherUploader.id, await createTestOrganisation(payload, otherUploader))
    await createTestPlatformAdministrator(payload, operator)
  })

  afterAll(async () => {
    await cleanLifecycleRecords()
  })

  it('lets an Organisation member or Platform Administrator delete an asset and blocks playback immediately', async () => {
    const ownedAsset = await createReadyAsset(owner)
    const operatorDeletedAsset = await createReadyAsset(otherUploader)

    await expect(
      deleteMediaAsset(payload, otherUploader, ownedAsset.mediaAssetId, { now }),
    ).rejects.toMatchObject({ status: 403 })

    await deleteMediaAsset(payload, owner, ownedAsset.mediaAssetId, { now })
    await deleteMediaAsset(payload, operator, operatorDeletedAsset.mediaAssetId, { now })

    await expect(
      createPlaybackGrant(payload, owner, ownedAsset.mediaAssetId, { now }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      createPlaybackGrant(payload, otherUploader, operatorDeletedAsset.mediaAssetId, { now }),
    ).rejects.toMatchObject({ status: 404 })

    await expect(
      payload.findByID({
        collection: 'media-assets',
        id: ownedAsset.id,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({
      status: 'deleted',
      statusChangedAt: now.toISOString(),
    })
    await expect(
      payload.find({
        collection: 'audit-events',
        overrideAccess: true,
        where: { action: { equals: 'asset_deleted' } },
      }),
    ).resolves.toMatchObject({ totalDocs: 2 })
  })

  it('deletes a successful raw source 24 hours after readiness exactly once', async () => {
    const asset = await createReadyAsset(owner)
    const readyAt = new Date('2026-09-14T12:00:00.000Z')
    const objectKey = 'private/raw/retained-lesson.mp4'
    const processingJobId = newProcessingJobId()
    await payload.create({
      collection: 'upload-sessions',
      data: {
        asset: asset.id,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        fileFingerprint: 'retained-lesson',
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        organisation: organisationIDs.get(owner.id),
        objectKey,
        owner: owner.id,
        partSize: 5 * 1024 * 1024,
        providerUploadId: `provider_upload_${crypto.randomUUID()}`,
        size: asset.size,
        status: 'completed',
        uploadSessionId: newUploadSessionId(),
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'processing-jobs',
      data: {
        asset: asset.id,
        attempts: 1,
        dispatchBy: readyAt.toISOString(),
        nextAttemptAt: readyAt.toISOString(),
        objectKey,
        organisation: organisationIDs.get(owner.id),
        owner: owner.id,
        processingJobId,
        queuedAt: readyAt.toISOString(),
        readyAt: readyAt.toISOString(),
        renditions: [],
        sourceDurationSeconds: 60,
        sourceHeight: 1080,
        sourceWidth: 1920,
        status: 'ready',
      },
      overrideAccess: true,
    })
    const providers = getFakeProviders()
    const deleteObject = vi.fn(async () => undefined)
    providers.storage = { ...providers.storage, deleteObject }

    await runMediaLifecycle(payload, { now, providers })
    await runMediaLifecycle(payload, { now, providers })

    expect(deleteObject).toHaveBeenCalledTimes(1)
    expect(deleteObject).toHaveBeenCalledWith(objectKey)
    await expect(
      payload.find({
        collection: 'upload-sessions',
        overrideAccess: true,
        where: { asset: { equals: asset.id } },
      }),
    ).resolves.toMatchObject({ docs: [{ objectKey: null }] })
  })

  it('keeps a failed raw source for 48 hours and then deletes it', async () => {
    const asset = await createReadyAsset(owner)
    const failedAt = new Date('2026-09-13T12:00:00.000Z')
    const objectKey = 'private/raw/failed-lesson.mp4'
    await payload.update({
      collection: 'media-assets',
      data: { drmContentId: null, expiresAt: null, status: 'failed' },
      id: asset.id,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'upload-sessions',
      data: {
        asset: asset.id,
        expiresAt: now.toISOString(),
        fileFingerprint: 'failed-lesson',
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        organisation: organisationIDs.get(owner.id),
        objectKey,
        owner: owner.id,
        partSize: 5 * 1024 * 1024,
        providerUploadId: `provider_upload_${crypto.randomUUID()}`,
        size: asset.size,
        status: 'completed',
        uploadSessionId: newUploadSessionId(),
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'processing-jobs',
      data: {
        asset: asset.id,
        attempts: 3,
        dispatchBy: failedAt.toISOString(),
        failedAt: failedAt.toISOString(),
        nextAttemptAt: failedAt.toISOString(),
        objectKey,
        organisation: organisationIDs.get(owner.id),
        owner: owner.id,
        processingJobId: newProcessingJobId(),
        queuedAt: failedAt.toISOString(),
        renditions: [],
        sourceDurationSeconds: 60,
        sourceHeight: 1080,
        sourceWidth: 1920,
        status: 'failed',
      },
      overrideAccess: true,
    })
    const providers = getFakeProviders()
    const deleteObject = vi.fn(async () => undefined)
    providers.storage = { ...providers.storage, deleteObject }

    await runMediaLifecycle(payload, {
      now: new Date(now.getTime() - 1),
      providers,
    })
    expect(deleteObject).not.toHaveBeenCalled()

    await runMediaLifecycle(payload, { now, providers })
    expect(deleteObject).toHaveBeenCalledOnce()
  })

  it('expires an asset after seven days, revokes delivery, and deletes outputs idempotently', async () => {
    const readyAt = new Date('2026-09-08T12:00:00.000Z')
    const asset = await createReadyAsset(owner)
    const providerJobId = `provider_job_${crypto.randomUUID()}` as const
    await payload.update({
      collection: 'media-assets',
      data: { expiresAt: now.toISOString() },
      id: asset.id,
      overrideAccess: true,
    })
    const processingJobId = newProcessingJobId()
    await payload.create({
      collection: 'processing-jobs',
      data: {
        asset: asset.id,
        attempts: 1,
        dispatchBy: readyAt.toISOString(),
        nextAttemptAt: readyAt.toISOString(),
        objectKey: 'private/raw/already-deleted.mp4',
        organisation: organisationIDs.get(owner.id),
        owner: owner.id,
        processingJobId,
        providerJobId,
        queuedAt: readyAt.toISOString(),
        readyAt: readyAt.toISOString(),
        renditions: [],
        sourceDurationSeconds: 60,
        sourceHeight: 1080,
        sourceWidth: 1920,
        status: 'ready',
      },
      overrideAccess: true,
    })
    const providers = getFakeProviders()
    const revokeAsset = vi.fn(async () => undefined)
    const deleteOutputs = vi.fn(async () => undefined)
    providers.delivery = { ...providers.delivery, revokeAsset }
    providers.transcode = { ...providers.transcode, deleteOutputs }

    await runMediaLifecycle(payload, { now, providers })
    await runMediaLifecycle(payload, { now, providers })

    expect(revokeAsset).toHaveBeenCalledOnce()
    expect(revokeAsset).toHaveBeenCalledWith(asset.mediaAssetId)
    expect(deleteOutputs).toHaveBeenCalledOnce()
    expect(deleteOutputs).toHaveBeenCalledWith({
      mediaAssetId: asset.mediaAssetId,
      processingJobId,
      providerJobId,
    })
    await expect(
      payload.findByID({ collection: 'media-assets', id: asset.id, overrideAccess: true }),
    ).resolves.toMatchObject({
      status: 'expired',
      statusChangedAt: now.toISOString(),
    })
  })

  it('keeps deletion immediate when provider cleanup fails and retries safely', async () => {
    const asset = await createReadyAsset(owner)
    const providers = getFakeProviders()
    const revokeAsset = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValue(undefined)
    const deleteOutputs = vi.fn(async () => undefined)
    providers.delivery = { ...providers.delivery, revokeAsset }
    providers.transcode = { ...providers.transcode, deleteOutputs }

    await expect(
      deleteMediaAsset(payload, owner, asset.mediaAssetId, { now, providers }),
    ).resolves.toBeUndefined()
    await expect(
      payload.findByID({ collection: 'media-assets', id: asset.id, overrideAccess: true }),
    ).resolves.toMatchObject({ status: 'deleted' })

    await runMediaLifecycle(payload, { now, providers })

    expect(revokeAsset).toHaveBeenCalledTimes(2)
    expect(deleteOutputs).toHaveBeenCalledOnce()
  })

  it('reconciles a lifecycle Audit Event after a transient database failure', async () => {
    const asset = await createReadyAsset(owner)
    const create = payload.create.bind(payload)
    const createSpy = vi.spyOn(payload, 'create').mockImplementation(async (args) => {
      if (
        args.collection === 'audit-events' &&
        'action' in args.data &&
        args.data.action === 'asset_deleted'
      ) {
        createSpy.mockImplementation(create)
        throw new Error('audit database unavailable')
      }
      return create(args as never)
    })

    await expect(
      deleteMediaAsset(payload, owner, asset.mediaAssetId, { now }),
    ).resolves.toBeUndefined()
    await runMediaLifecycle(payload, { now })
    createSpy.mockRestore()

    await expect(
      payload.find({
        collection: 'audit-events',
        depth: 0,
        overrideAccess: true,
        where: { eventKey: { equals: `media-asset:${asset.id}:asset_deleted` } },
      }),
    ).resolves.toMatchObject({
      docs: [expect.objectContaining({ actor: owner.id, occurredAt: now.toISOString() })],
      totalDocs: 1,
    })
  })

  it('records one Audit Event when concurrent deletion requests race', async () => {
    const asset = await createReadyAsset(owner)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await Promise.all([
      deleteMediaAsset(payload, owner, asset.mediaAssetId, { now }),
      deleteMediaAsset(payload, owner, asset.mediaAssetId, { now }),
    ])

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
    await expect(
      payload.find({
        collection: 'audit-events',
        overrideAccess: true,
        where: { eventKey: { equals: `media-asset:${asset.id}:asset_deleted` } },
      }),
    ).resolves.toMatchObject({ totalDocs: 1 })
  })

  it('keeps expired metadata visible to its Organisation member and lets Platform Administrators inspect every asset', async () => {
    const ownedAsset = await createReadyAsset(owner)
    const expiredAsset = await createReadyAsset(owner)
    const otherAsset = await createReadyAsset(otherUploader)
    await payload.update({
      collection: 'media-assets',
      data: { status: 'expired' },
      id: expiredAsset.id,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'upload-sessions',
      data: {
        asset: otherAsset.id,
        expiresAt: now.toISOString(),
        fileFingerprint: 'operator-visible',
        fileName: otherAsset.fileName,
        mimeType: otherAsset.mimeType,
        organisation: organisationIDs.get(otherUploader.id),
        owner: otherUploader.id,
        partSize: 5 * 1024 * 1024,
        providerUploadId: `provider_upload_${crypto.randomUUID()}`,
        size: otherAsset.size,
        status: 'completed',
        uploadSessionId: newUploadSessionId(),
      },
      overrideAccess: true,
    })
    await deleteMediaAsset(payload, owner, ownedAsset.mediaAssetId, { now })

    await expect(listVisibleAssets(payload, owner)).resolves.toEqual([
      expect.objectContaining({ mediaAssetId: expiredAsset.mediaAssetId, status: 'expired' }),
    ])
    await expect(listVisibleAssets(payload, operator)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mediaAssetId: expiredAsset.mediaAssetId }),
        expect.objectContaining({ mediaAssetId: otherAsset.mediaAssetId }),
      ]),
    )
    await expect(
      getVisibleAsset(payload, operator, otherAsset.mediaAssetId),
    ).resolves.toMatchObject({
      mediaAssetId: otherAsset.mediaAssetId,
    })
  })
})
