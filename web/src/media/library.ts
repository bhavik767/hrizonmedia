import 'server-only'

import type { Payload } from 'payload'

import type { MediaAsset, PilotMember, UploadSession } from '@/payload-types'

import {
  newMediaAssetId,
  newProcessingJobId,
  newUploadSessionId,
  type MediaAssetId,
  type UploadSessionId,
} from './identifiers'
import type { CompletedPart, MediaProviders } from './providers/contracts'
import { getFakeProviders, InvalidMediaError, MultipartUploadError } from './providers/fake'
import type { MediaAssetDetail, MediaAssetStatus, MediaAssetSummary, UploadMetadata } from './types'

const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024
const MAX_DURATION_SECONDS = 2 * 60 * 60
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
    mediaAssetId: asset.mediaAssetId as MediaAssetId,
    size: asset.size,
    status: asset.status as MediaAssetStatus,
  }
}

function validateMetadata(input: UploadMetadata): void {
  const extension = input.fileName.toLowerCase().split('.').at(-1)
  const supported =
    (input.mimeType === 'video/mp4' && extension === 'mp4') ||
    (input.mimeType === 'video/x-matroska' && extension === 'mkv')

  if (!supported) throw new MediaLibraryError('Choose an MP4 or MKV video.', 400)
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > MAX_ASSET_BYTES) {
    throw new MediaLibraryError('The video must be no larger than 2 GB.', 400)
  }
  if (!input.fileFingerprint.trim() || input.fileFingerprint.length > 500) {
    throw new MediaLibraryError('The selected file could not be identified safely.', 400)
  }
}

function sessionResponse(session: UploadSession, asset: MediaAsset, parts: CompletedPart[] = []) {
  return {
    asset: summary(asset),
    completeURL: `/api/demo/uploads/${session.uploadSessionId}/complete`,
    completedParts: parts,
    expiresAt: session.expiresAt,
    partSize: session.partSize,
    partUploadURL: `/api/demo/uploads/${session.uploadSessionId}/parts/{partNumber}`,
    uploadSessionId: session.uploadSessionId as UploadSessionId,
  }
}

async function markExpired(
  payload: Payload,
  session: UploadSession,
  providers: MediaProviders,
): Promise<void> {
  await providers.storage.abortMultipart(session.providerUploadId)
  await Promise.all([
    payload.update({
      collection: 'upload-sessions',
      data: { status: 'expired' },
      id: session.id,
      overrideAccess: true,
    }),
    payload.update({
      collection: 'media-assets',
      data: { status: 'expired', statusChangedAt: new Date().toISOString() },
      id: relationID(session.asset),
      overrideAccess: true,
    }),
  ])
}

async function requirePendingSession(
  payload: Payload,
  ownerID: number,
  uploadSessionId: UploadSessionId,
  providers: MediaProviders,
): Promise<UploadSession> {
  const session = await findOwnedSession(payload, ownerID, uploadSessionId)
  if (session.status === 'completed') throw new MediaLibraryError('Upload already completed.', 409)
  if (session.status === 'aborted') throw new MediaLibraryError('Upload session was aborted.', 410)
  if (session.status === 'expired' || new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session.status === 'pending') await markExpired(payload, session, providers)
    throw new MediaLibraryError('Upload session has expired. Start a new upload.', 410)
  }
  return session
}

export async function createUploadSession(
  payload: Payload,
  owner: PilotMember,
  input: UploadMetadata,
  providers: MediaProviders = getFakeProviders(),
) {
  validateMetadata(input)
  await cleanupAbandonedUploads(payload, new Date(), providers)
  const now = new Date()
  const mediaAssetId = newMediaAssetId()
  const uploadSessionId = newUploadSessionId()
  const initiated = await providers.storage.initiateMultipart({ metadata: input, uploadSessionId })

  let asset: MediaAsset | null = null
  try {
    asset = await payload.create({
      collection: 'media-assets',
      data: {
        fileName: input.fileName,
        mediaAssetId,
        mimeType: input.mimeType,
        owner: owner.id,
        size: input.size,
        status: 'uploading',
        statusChangedAt: now.toISOString(),
      },
      overrideAccess: true,
    })

    const session = await payload.create({
      collection: 'upload-sessions',
      data: {
        asset: asset.id,
        expiresAt: new Date(now.getTime() + UPLOAD_SESSION_LIFETIME_MS).toISOString(),
        fileFingerprint: input.fileFingerprint,
        fileName: input.fileName,
        mimeType: input.mimeType,
        owner: owner.id,
        partSize: initiated.partSize,
        providerUploadId: initiated.providerUploadId,
        size: input.size,
        status: 'pending',
        uploadSessionId,
      },
      overrideAccess: true,
    })
    return sessionResponse(session, asset)
  } catch (error) {
    await providers.storage.abortMultipart(initiated.providerUploadId)
    if (asset) {
      await payload.delete({ collection: 'media-assets', id: asset.id, overrideAccess: true })
    }
    throw error
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

export async function resumeUploadSession(
  payload: Payload,
  owner: PilotMember,
  uploadSessionId: UploadSessionId,
  fileFingerprint: string,
  providers: MediaProviders = getFakeProviders(),
) {
  const session = await requirePendingSession(payload, owner.id, uploadSessionId, providers)
  if (session.fileFingerprint !== fileFingerprint) {
    throw new MediaLibraryError('The selected file does not match this upload session.', 409)
  }
  const asset = await payload.findByID({
    collection: 'media-assets',
    depth: 0,
    id: relationID(session.asset),
    overrideAccess: true,
  })
  try {
    return sessionResponse(
      session,
      asset,
      await providers.storage.listParts(session.providerUploadId),
    )
  } catch (error) {
    if (error instanceof MultipartUploadError) {
      throw new MediaLibraryError('The resumable upload is no longer available. Start again.', 410)
    }
    throw error
  }
}

export async function uploadPart(
  payload: Payload,
  owner: PilotMember,
  uploadSessionId: UploadSessionId,
  partNumber: number,
  bytes: Uint8Array,
  providers: MediaProviders = getFakeProviders(),
): Promise<CompletedPart> {
  const session = await requirePendingSession(payload, owner.id, uploadSessionId, providers)
  if (bytes.byteLength > session.partSize) {
    throw new MediaLibraryError(`Upload parts may not exceed ${session.partSize} bytes.`, 400)
  }
  try {
    return await providers.storage.uploadPart({
      bytes,
      partNumber,
      providerUploadId: session.providerUploadId,
    })
  } catch (error) {
    if (error instanceof MultipartUploadError) throw new MediaLibraryError(error.message, 400)
    throw error
  }
}

async function rejectCompletedUpload(
  payload: Payload,
  session: UploadSession,
  providers: MediaProviders,
  message: string,
): Promise<never> {
  await providers.storage.abortMultipart(session.providerUploadId)
  await Promise.all([
    payload.update({
      collection: 'upload-sessions',
      data: { status: 'aborted' },
      id: session.id,
      overrideAccess: true,
    }),
    payload.update({
      collection: 'media-assets',
      data: { status: 'failed', statusChangedAt: new Date().toISOString() },
      id: relationID(session.asset),
      overrideAccess: true,
    }),
  ])
  throw new MediaLibraryError(message, 400)
}

export async function completeUpload(
  payload: Payload,
  owner: PilotMember,
  uploadSessionId: UploadSessionId,
  parts: CompletedPart[],
  providers: MediaProviders = getFakeProviders(),
): Promise<MediaAssetSummary> {
  const session = await requirePendingSession(payload, owner.id, uploadSessionId, providers)
  let stored
  try {
    stored = await providers.storage.completeMultipart({
      parts,
      providerUploadId: session.providerUploadId,
    })
  } catch (error) {
    if (error instanceof MultipartUploadError) throw new MediaLibraryError(error.message, 400)
    throw error
  }

  let probe
  try {
    probe = await providers.storage.probe(stored.objectKey)
  } catch (error) {
    if (error instanceof InvalidMediaError) {
      return rejectCompletedUpload(payload, session, providers, error.message)
    }
    throw error
  }
  const extension = session.fileName.toLowerCase().split('.').at(-1)
  if ((probe.mimeType === 'video/mp4') !== (extension === 'mp4')) {
    return rejectCompletedUpload(
      payload,
      session,
      providers,
      'The completed video container does not match its file name.',
    )
  }
  if (probe.size <= 0 || probe.size > MAX_ASSET_BYTES) {
    return rejectCompletedUpload(
      payload,
      session,
      providers,
      'The video must be no larger than 2 GB.',
    )
  }
  if (probe.durationSeconds > MAX_DURATION_SECONDS) {
    return rejectCompletedUpload(
      payload,
      session,
      providers,
      'The video must be no longer than two hours.',
    )
  }

  const assetRecordID = relationID(session.asset)
  const asset = await payload.findByID({
    collection: 'media-assets',
    depth: 0,
    id: assetRecordID,
    overrideAccess: true,
  })
  const providerJobId = await providers.transcode.queue({
    mediaAssetId: asset.mediaAssetId as MediaAssetId,
    objectKey: stored.objectKey,
  })
  const queuedAt = new Date().toISOString()
  const processingJobId = newProcessingJobId()

  await payload.update({
    collection: 'upload-sessions',
    data: { objectKey: stored.objectKey, status: 'completed' },
    id: session.id,
    overrideAccess: true,
  })
  await payload.create({
    collection: 'processing-jobs',
    data: {
      asset: asset.id,
      owner: owner.id,
      processingJobId,
      providerJobId,
      queuedAt,
      status: 'queued',
    },
    overrideAccess: true,
  })
  const queuedAsset = await payload.update({
    collection: 'media-assets',
    data: {
      durationSeconds: probe.durationSeconds,
      mimeType: probe.mimeType,
      size: probe.size,
      status: 'queued',
      statusChangedAt: queuedAt,
      verifiedAt: queuedAt,
    },
    id: asset.id,
    overrideAccess: true,
  })
  return summary(queuedAsset)
}

export async function abortUpload(
  payload: Payload,
  owner: PilotMember,
  uploadSessionId: UploadSessionId,
  providers: MediaProviders = getFakeProviders(),
): Promise<void> {
  const session = await findOwnedSession(payload, owner.id, uploadSessionId)
  if (
    session.status === 'completed' ||
    session.status === 'aborted' ||
    session.status === 'expired'
  )
    return
  await providers.storage.abortMultipart(session.providerUploadId)
  await Promise.all([
    payload.update({
      collection: 'upload-sessions',
      data: { status: 'aborted' },
      id: session.id,
      overrideAccess: true,
    }),
    payload.update({
      collection: 'media-assets',
      data: { status: 'failed', statusChangedAt: new Date().toISOString() },
      id: relationID(session.asset),
      overrideAccess: true,
    }),
  ])
}

export async function cleanupAbandonedUploads(
  payload: Payload,
  now = new Date(),
  providers: MediaProviders = getFakeProviders(),
): Promise<number> {
  const expired = await payload.find({
    collection: 'upload-sessions',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: {
      and: [
        { status: { equals: 'pending' } },
        { expiresAt: { less_than_equal: now.toISOString() } },
      ],
    },
  })
  for (const session of expired.docs) await markExpired(payload, session, providers)
  return expired.docs.length
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
  mediaAssetId: MediaAssetId,
): Promise<MediaAssetDetail> {
  await advanceFakePipeline(payload, owner.id)
  const result = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { and: [{ mediaAssetId: { equals: mediaAssetId } }, { owner: { equals: owner.id } }] },
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
    processingJobId: (jobs.docs[0]?.processingJobId as MediaAssetDetail['processingJobId']) ?? null,
    providerJobId: (jobs.docs[0]?.providerJobId as MediaAssetDetail['providerJobId']) ?? null,
    uploadSessionId: session.uploadSessionId as UploadSessionId,
  }
}
