import { createLocalReq, type Payload } from 'payload'

import type { MediaAsset, PilotMember, UploadSession } from '@/payload-types'

import {
  newMediaAssetId,
  newProcessingJobId,
  newUploadSessionId,
  type MediaAssetId,
  type UploadSessionId,
} from './identifiers'
import { getFakeProviders, InvalidMediaError } from './providers/fake'
import { newProcessingJobData, runProcessingCycle, type ProcessingOptions } from './processing'
import type {
  MediaAssetDetail,
  MediaAssetStatus,
  MediaAssetSummary,
  UploadedFile,
  UploadMetadata,
} from './types'

const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024
const UPLOAD_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000

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
    mediaAssetId: asset.mediaAssetId as MediaAssetId,
    size: asset.size,
    status: asset.status as MediaAssetStatus,
  }
}

function validateMetadata(input: UploadMetadata) {
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
  input: UploadMetadata,
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
  file: UploadedFile,
  processingOptions: ProcessingOptions = {},
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
      metadata: { fileName: file.name, mimeType: file.type, size: file.size },
      uploadSessionId,
    })
  } catch (error) {
    if (error instanceof InvalidMediaError) throw new MediaLibraryError(error.message, 400)
    throw error
  }

  const queuedAt = processingOptions.now ?? new Date()
  const processingJobId = newProcessingJobId()

  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null) throw new Error('Processing Jobs require database transactions.')
  const req = await createLocalReq({ req: { transactionID } }, payload)
  let queuedAsset: MediaAsset
  try {
    await payload.update({
      collection: 'upload-sessions',
      data: { objectKey: stored.objectKey, status: 'completed' },
      id: session.id,
      overrideAccess: true,
      req,
    })
    await payload.create({
      collection: 'processing-jobs',
      data: {
        ...newProcessingJobData({
          asset,
          objectKey: stored.objectKey,
          ownerID: owner.id,
          processingJobId,
          queuedAt,
          source: stored.source,
        }),
      },
      overrideAccess: true,
      req,
    })
    queuedAsset = await payload.update({
      collection: 'media-assets',
      data: { status: 'queued', statusChangedAt: queuedAt.toISOString() },
      id: asset.id,
      overrideAccess: true,
      req,
    })
    await payload.db.commitTransaction(transactionID)
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }

  await runProcessingCycle(payload, {
    ...processingOptions,
    now: queuedAt,
    provider: processingOptions.provider ?? providers.transcode,
  })

  return summary(queuedAsset)
}

export async function listOwnedAssets(
  payload: Payload,
  owner: PilotMember,
  processingOptions: ProcessingOptions = {},
): Promise<MediaAssetSummary[]> {
  await runProcessingCycle(payload, processingOptions)
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
  mediaAssetId: MediaAssetId,
  processingOptions: ProcessingOptions = {},
): Promise<MediaAssetDetail> {
  await runProcessingCycle(payload, processingOptions)
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
    canRetry: asset.status === 'failed' && Boolean(session.objectKey),
    dispatchedAt: jobs.docs[0]?.dispatchedAt ?? null,
    failureMessage: jobs.docs[0]?.failureMessage ?? null,
    mimeType: asset.mimeType,
    processingJobId: (jobs.docs[0]?.processingJobId as MediaAssetDetail['processingJobId']) ?? null,
    providerJobId: (jobs.docs[0]?.providerJobId as MediaAssetDetail['providerJobId']) ?? null,
    readyAt: jobs.docs[0]?.readyAt ?? null,
    renditions: (jobs.docs[0]?.renditions as MediaAssetDetail['renditions']) ?? null,
    uploadSessionId: session.uploadSessionId as UploadSessionId,
  }
}

export async function retryOwnedAssetProcessing(
  payload: Payload,
  owner: PilotMember,
  mediaAssetId: MediaAssetId,
  processingOptions: ProcessingOptions = {},
): Promise<MediaAssetSummary> {
  const assetResult = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [{ mediaAssetId: { equals: mediaAssetId } }, { owner: { equals: owner.id } }],
    },
  })
  const asset = assetResult.docs[0]
  if (!asset) throw new MediaLibraryError('Media Asset not found.', 404)
  if (asset.status !== 'failed')
    throw new MediaLibraryError('Only failed assets can be retried.', 409)

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
  const job = jobs.docs[0]
  if (!session?.objectKey || !job) {
    throw new MediaLibraryError('The source is no longer available for retry.', 409)
  }

  const now = processingOptions.now ?? new Date()
  await payload.update({
    collection: 'processing-jobs',
    data: {
      attempts: 0,
      failedAt: null,
      failureCode: null,
      failureMessage: null,
      nextAttemptAt: now.toISOString(),
      providerJobId: null,
      status: 'queued',
    },
    id: job.id,
    overrideAccess: true,
  })
  const queuedAsset = await payload.update({
    collection: 'media-assets',
    data: { status: 'queued', statusChangedAt: now.toISOString() },
    id: asset.id,
    overrideAccess: true,
  })
  await runProcessingCycle(payload, { ...processingOptions, now })
  return summary(
    await payload.findByID({
      collection: 'media-assets',
      id: queuedAsset.id,
      overrideAccess: true,
    }),
  )
}
