import type { Payload } from 'payload'

import type { MediaAsset, PilotMember, UploadSession } from '@/payload-types'

import {
  newMediaAssetId,
  newUploadSessionId,
  type MediaAssetId,
  type UploadSessionId,
} from './identifiers'
import { getFakeProviders, InvalidMediaError } from './providers/fake'
import type { MediaAssetDetail, MediaAssetSummary, MediaAssetStatus } from './types'

const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024
const UPLOAD_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000
const FAKE_PROCESSING_DELAY_MS = 2_000
const FAKE_READY_DELAY_MS = 4_000

export class MediaLibraryError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

function relationID(value: number | { id: number }): number {
  return typeof value === 'number' ? value : value.id
}

function summary(asset: MediaAsset): MediaAssetSummary {
  return {
    createdAt: asset.createdAt,
    fileName: asset.fileName,
    mediaAssetId: asset.mediaAssetId,
    size: asset.size,
    status: asset.status as MediaAssetStatus,
  }
}

function validateMetadata(input: { fileName: string; mimeType: string; size: number }) {
  const extension = input.fileName.toLowerCase().split('.').at(-1)
  const supported =
    (input.mimeType === 'video/mp4' && extension === 'mp4') ||
    (input.mimeType === 'video/x-matroska' && extension === 'mkv')

  if (!supported) throw new MediaLibraryError('Choose an MP4 or MKV video.', 400)
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > MAX_ASSET_BYTES) {
    throw new MediaLibraryError('The video must be no larger than 2 GB.', 400)
  }
}

export async function createUploadSession(
  payload: Payload,
  owner: PilotMember,
  input: { fileName: string; mimeType: string; size: number },
) {
  validateMetadata(input)
  const now = new Date()
  const mediaAssetId = newMediaAssetId()
  const uploadSessionId = newUploadSessionId()

  const asset = await payload.create({
    collection: 'media-assets',
    data: {
      ...input,
      mediaAssetId,
      owner: owner.id,
      status: 'uploading',
      statusChangedAt: now.toISOString(),
    },
    overrideAccess: true,
  })

  await payload.create({
    collection: 'upload-sessions',
    data: {
      ...input,
      asset: asset.id,
      expiresAt: new Date(now.getTime() + UPLOAD_SESSION_LIFETIME_MS).toISOString(),
      owner: owner.id,
      status: 'pending',
      uploadSessionId,
    },
    overrideAccess: true,
  })

  return {
    asset: summary(asset),
    uploadSessionId,
    uploadURL: `/api/demo/uploads/${uploadSessionId}`,
  }
}

async function findOwnedSession(
  payload: Payload,
  ownerID: number,
  uploadSessionId: UploadSessionId,
): Promise<UploadSession> {
  const result = await payload.find({
    collection: 'upload-sessions',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [{ uploadSessionId: { equals: uploadSessionId } }, { owner: { equals: ownerID } }],
    },
  })
  const session = result.docs[0]
  if (!session) throw new MediaLibraryError('Upload session not found.', 404)
  return session
}

export async function completeUpload(
  payload: Payload,
  owner: PilotMember,
  uploadSessionId: UploadSessionId,
  file: File,
): Promise<MediaAssetSummary> {
  const session = await findOwnedSession(payload, owner.id, uploadSessionId)
  if (session.status !== 'pending') throw new MediaLibraryError('Upload already completed.', 409)
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new MediaLibraryError('Upload session has expired.', 410)
  }
  if (
    file.name !== session.fileName ||
    file.type !== session.mimeType ||
    file.size !== session.size
  ) {
    throw new MediaLibraryError('The uploaded file does not match this session.', 400)
  }

  const assetRecordID = relationID(session.asset)
  const asset = await payload.findByID({
    collection: 'media-assets',
    depth: 0,
    id: assetRecordID,
    overrideAccess: true,
  })
  const providers = getFakeProviders()
  let stored
  try {
    stored = await providers.storage.store({
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type,
      uploadSessionId,
    })
  } catch (error) {
    if (error instanceof InvalidMediaError) throw new MediaLibraryError(error.message, 400)
    throw error
  }

  const providerJobId = await providers.transcode.queue({
    mediaAssetId: asset.mediaAssetId as MediaAssetId,
    objectKey: stored.objectKey,
  })
  const queuedAt = new Date().toISOString()

  await payload.update({
    collection: 'upload-sessions',
    data: { objectKey: stored.objectKey, status: 'completed' },
    id: session.id,
    overrideAccess: true,
  })
  await payload.create({
    collection: 'processing-jobs',
    data: { asset: asset.id, owner: owner.id, providerJobId, queuedAt, status: 'queued' },
    overrideAccess: true,
  })
  const queuedAsset = await payload.update({
    collection: 'media-assets',
    data: { status: 'queued', statusChangedAt: queuedAt },
    id: asset.id,
    overrideAccess: true,
  })

  return summary(queuedAsset)
}

async function advanceFakePipeline(payload: Payload, ownerID: number): Promise<void> {
  const jobs = await payload.find({
    collection: 'processing-jobs',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: { owner: { equals: ownerID } },
  })

  for (const job of jobs.docs) {
    const age = Date.now() - new Date(job.queuedAt).getTime()
    const nextStatus =
      job.status === 'queued' && age >= FAKE_PROCESSING_DELAY_MS
        ? 'processing'
        : job.status === 'processing' && age >= FAKE_READY_DELAY_MS
          ? 'ready'
          : null
    if (!nextStatus) continue

    await payload.update({
      collection: 'processing-jobs',
      data: { status: nextStatus },
      id: job.id,
      overrideAccess: true,
    })
    await payload.update({
      collection: 'media-assets',
      data: { status: nextStatus, statusChangedAt: new Date().toISOString() },
      id: relationID(job.asset),
      overrideAccess: true,
    })
  }
}

export async function listOwnedAssets(
  payload: Payload,
  owner: PilotMember,
): Promise<MediaAssetSummary[]> {
  await advanceFakePipeline(payload, owner.id)
  const result = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    sort: '-createdAt',
    where: { owner: { equals: owner.id } },
  })
  return result.docs.map(summary)
}

export async function getOwnedAsset(
  payload: Payload,
  owner: PilotMember,
  mediaAssetId: string,
): Promise<MediaAssetDetail> {
  await advanceFakePipeline(payload, owner.id)
  const result = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [{ mediaAssetId: { equals: mediaAssetId } }, { owner: { equals: owner.id } }],
    },
  })
  const asset = result.docs[0]
  if (!asset) throw new MediaLibraryError('Media Asset not found.', 404)

  const [sessions, jobs] = await Promise.all([
    payload.find({
      collection: 'upload-sessions',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { asset: { equals: asset.id } },
    }),
    payload.find({
      collection: 'processing-jobs',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { asset: { equals: asset.id } },
    }),
  ])
  const session = sessions.docs[0]
  if (!session) throw new MediaLibraryError('Upload Session not found.', 500)

  return {
    ...summary(asset),
    mimeType: asset.mimeType,
    providerJobId: jobs.docs[0]?.providerJobId ?? null,
    uploadSessionId: session.uploadSessionId,
  }
}
