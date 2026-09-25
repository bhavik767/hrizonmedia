import 'server-only'

import { createLocalReq, type Payload } from 'payload'

import type { MediaAsset, Member, UploadSession } from '@/payload-types'
import { recordAuditEvent } from '@/audit/events'
import { assertMediaActivityAllowed } from '@/organisations/operations'
import { authorizeOrganisationMedia } from '@/organisations/authorization'
import { getOrganisationUploadPolicy } from '@/organisations/settings'

import {
  newMediaAssetId,
  newProcessingJobId,
  newUploadSessionId,
  processingOutputPrefix,
  type MediaAssetId,
  type ProviderUploadId,
  type UploadSessionId,
} from './identifiers'
import type { CompletedPart } from './multipart'
import type { MediaProviders, StorageProvider } from './providers/contracts'
import { InvalidMediaError, MultipartUploadError } from './providers/errors'
import { getMediaProviders } from './providers'
import { newProcessingJobData, runProcessingCycle, type ProcessingOptions } from './processing'
import type {
  MediaAssetDetail,
  MediaAssetStatus,
  MediaAssetSummary,
  MediaFolderSummary,
  MediaProtectionPolicy,
  UploadMetadata,
} from './types'

const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024
const MAX_DURATION_SECONDS = 2 * 60 * 60
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

function optionalRelationID(value: number | { id: number } | null | undefined): number | null {
  return value === null || value === undefined ? null : relationID(value)
}

function summary(asset: MediaAsset): MediaAssetSummary {
  return {
    createdAt: asset.createdAt,
    durationSeconds: asset.durationSeconds,
    folderID: optionalRelationID(asset.folder),
    organisationID: optionalRelationID(asset.organisation),
    fileName: asset.fileName,
    mediaAssetId: asset.mediaAssetId as MediaAssetId,
    size: asset.size,
    status: asset.status as MediaAssetStatus,
  }
}

function folderSummary(folder: {
  id: number
  name: string
  organisation: number | { id: number }
}): MediaFolderSummary {
  return { id: folder.id, name: folder.name, organisationID: relationID(folder.organisation) }
}

async function folderForOrganisation(payload: Payload, organisationID: number, folderID: number) {
  const folder = await payload.findByID({
    collection: 'media-folders',
    depth: 0,
    id: folderID,
    overrideAccess: true,
  })
  if (relationID(folder.organisation) !== organisationID)
    throw new MediaLibraryError('Folder not found.', 404)
  return folder
}

async function folderForUpload(
  payload: Payload,
  owner: Member,
  input: UploadMetadata,
  organisationID?: number,
) {
  if (input.folderID === undefined) return undefined
  if (!organisationID || !Number.isSafeInteger(input.folderID) || input.folderID <= 0) {
    throw new MediaLibraryError('Choose a Folder in this Organisation.', 400)
  }
  await authorizeOrganisationMedia(payload, owner, { operation: 'create', organisationID })
  return folderForOrganisation(payload, organisationID, input.folderID)
}

export async function createMediaFolder(
  payload: Payload,
  member: Member,
  organisationID: number,
  name: string,
): Promise<MediaFolderSummary> {
  if (
    !Number.isSafeInteger(organisationID) ||
    organisationID <= 0 ||
    name.trim().length === 0 ||
    name.trim() !== name ||
    name.length > 120
  ) {
    throw new MediaLibraryError('Choose a valid Folder name.', 400)
  }
  await authorizeOrganisationMedia(payload, member, { operation: 'create', organisationID })
  return folderSummary(
    await payload.create({
      collection: 'media-folders',
      data: { name, organisation: organisationID, owner: member.id },
      overrideAccess: true,
    }),
  )
}

export async function listMediaFolders(
  payload: Payload,
  member: Member,
  organisationID: number,
): Promise<MediaFolderSummary[]> {
  await authorizeOrganisationMedia(payload, member, { operation: 'browse', organisationID })
  const folders = await payload.find({
    collection: 'media-folders',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    sort: 'name',
    where: { organisation: { equals: organisationID } },
  })
  return folders.docs.map(folderSummary)
}

export async function renameMediaFolder(
  payload: Payload,
  member: Member,
  folderID: number,
  name: string,
): Promise<MediaFolderSummary> {
  if (name.trim().length === 0 || name.trim() !== name || name.length > 120)
    throw new MediaLibraryError('Choose a valid Folder name.', 400)
  const folder = await payload.findByID({
    collection: 'media-folders',
    depth: 0,
    id: folderID,
    overrideAccess: true,
  })
  const authorisation = await authorizeOrganisationMedia(payload, member, {
    operation: 'create',
    organisationID: relationID(folder.organisation),
  })
  const assets = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { and: [{ folder: { equals: folderID } }, { owner: { not_equals: member.id } }] },
  })
  if (authorisation.role === 'publisher' && assets.docs[0])
    throw new MediaLibraryError(
      'Publishers cannot rename a Folder containing another Publisher’s Media Assets.',
      403,
    )
  return folderSummary(
    await payload.update({
      collection: 'media-folders',
      id: folderID,
      data: { name },
      overrideAccess: true,
    }),
  )
}

export async function moveMediaAssetToFolder(
  payload: Payload,
  member: Member,
  mediaAssetId: MediaAssetId,
  folderID: number | null,
): Promise<MediaAssetSummary> {
  const found = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { mediaAssetId: { equals: mediaAssetId } },
  })
  const asset = found.docs[0]
  if (!asset || !asset.organisation) throw new MediaLibraryError('Media Asset not found.', 404)
  await authorizeOrganisationMedia(payload, member, { assetID: asset.id, operation: 'manage' })
  if (folderID !== null)
    await folderForOrganisation(payload, relationID(asset.organisation), folderID)
  return summary(
    await payload.update({
      collection: 'media-assets',
      id: asset.id,
      data: { folder: folderID },
      overrideAccess: true,
    }),
  )
}

export async function deleteMediaFolder(
  payload: Payload,
  member: Member,
  folderID: number,
): Promise<void> {
  const folder = await payload.findByID({
    collection: 'media-folders',
    depth: 0,
    id: folderID,
    overrideAccess: true,
  })
  const organisationID = relationID(folder.organisation)
  const authorization = await authorizeOrganisationMedia(payload, member, {
    operation: 'create',
    organisationID,
  })
  const otherPublisherAsset = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { and: [{ folder: { equals: folderID } }, { owner: { not_equals: member.id } }] },
  })
  if (authorization.role === 'publisher' && otherPublisherAsset.docs[0]) {
    throw new MediaLibraryError(
      'Publishers cannot delete a Folder containing another Publisher’s Media Assets.',
      403,
    )
  }
  await payload.update({
    collection: 'media-assets',
    data: { folder: null },
    overrideAccess: true,
    where: { folder: { equals: folderID } },
  })
  await payload.update({
    collection: 'upload-sessions',
    data: { folder: null },
    overrideAccess: true,
    where: { folder: { equals: folderID } },
  })
  await payload.delete({ collection: 'media-folders', id: folderID, overrideAccess: true })
}

function validateMetadata(
  input: UploadMetadata,
  maximumUploadSizeBytes = MAX_ASSET_BYTES,
): UploadMetadata {
  if (
    input.fileName.length === 0 ||
    input.fileName.length > 255 ||
    input.fileName !== input.fileName.trim() ||
    /[\\/\u0000-\u001f\u007f]/.test(input.fileName) ||
    input.fileName === '.' ||
    input.fileName === '..'
  ) {
    throw new MediaLibraryError('The video file name is invalid.', 400)
  }
  const extension = input.fileName.toLowerCase().split('.').at(-1)
  if (extension !== 'mp4' && extension !== 'mkv') {
    throw new MediaLibraryError('Choose an MP4 or MKV video.', 400)
  }
  if (
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    input.size > Math.min(MAX_ASSET_BYTES, maximumUploadSizeBytes)
  ) {
    throw new MediaLibraryError("The video exceeds this Organisation's upload limit.", 400)
  }
  if (!input.fileFingerprint.trim() || input.fileFingerprint.length > 500) {
    throw new MediaLibraryError('The selected file could not be identified safely.', 400)
  }
  return { ...input, mimeType: extension === 'mp4' ? 'video/mp4' : 'video/x-matroska' }
}

function mediaProtectionPolicy(value: unknown): MediaProtectionPolicy | null {
  return value === 'protected' || value === 'standard' ? value : null
}

async function organisationUploadDetails(
  payload: Payload,
  owner: Member,
  input: UploadMetadata,
): Promise<{
  expiresAt: string
  maximumUploadSizeBytes: number
  mediaProtectionPolicy: MediaProtectionPolicy
  organisationID: number
  retentionDays: number
}> {
  const organisationID = input.organisationID
  if (
    organisationID === undefined ||
    !Number.isSafeInteger(organisationID) ||
    organisationID <= 0
  ) {
    throw new MediaLibraryError('Choose an Organisation for this upload.', 400)
  }
  await authorizeOrganisationMedia(payload, owner, {
    operation: 'create',
    organisationID,
  })
  const policy = await getOrganisationUploadPolicy(payload, organisationID)
  const requestedPolicy = mediaProtectionPolicy(input.mediaProtectionPolicy)
  if (input.mediaProtectionPolicy !== undefined && !requestedPolicy) {
    throw new MediaLibraryError('Choose a valid Media Protection Policy.', 400)
  }
  const retentionDays = input.retentionDays ?? policy.defaultRetentionDays
  if (
    !Number.isSafeInteger(retentionDays) ||
    retentionDays <= 0 ||
    retentionDays > policy.defaultRetentionDays
  ) {
    throw new MediaLibraryError('Choose a retention period within the Organisation limit.', 400)
  }
  return {
    expiresAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString(),
    maximumUploadSizeBytes: policy.maximumUploadSizeBytes,
    mediaProtectionPolicy: policy.drmRequired
      ? 'protected'
      : (requestedPolicy ?? policy.drmDefault),
    organisationID,
    retentionDays,
  }
}

function sessionResponse(session: UploadSession, asset: MediaAsset, parts: CompletedPart[] = []) {
  return {
    asset: summary(asset),
    completeURL: `/api/demo/uploads/${session.uploadSessionId}/complete`,
    completedParts: parts,
    expiresAt: session.expiresAt,
    partSize: session.partSize,
    partTargetURL: `/api/demo/uploads/${session.uploadSessionId}/parts/{partNumber}`,
    uploadSessionId: session.uploadSessionId as UploadSessionId,
  }
}

function providerUploadID(session: UploadSession): ProviderUploadId {
  return session.providerUploadId as ProviderUploadId
}

function providerUploadData(session: UploadSession): string | undefined {
  return session.providerUploadData ?? undefined
}

async function terminateUpload(
  payload: Payload,
  session: UploadSession,
  providers: MediaProviders,
  sessionStatus: 'aborted' | 'expired',
  assetStatus: 'failed' | 'expired',
  actorID?: number,
): Promise<void> {
  const occurredAt = new Date()
  await providers.storage.abortMultipart(providerUploadID(session), providerUploadData(session))
  await Promise.all([
    payload.update({
      collection: 'upload-sessions',
      data: { status: sessionStatus },
      id: session.id,
      overrideAccess: true,
    }),
    payload.update({
      collection: 'media-assets',
      data: { status: assetStatus, statusChangedAt: occurredAt.toISOString() },
      id: relationID(session.asset),
      overrideAccess: true,
    }),
  ])
  await recordAuditEvent(payload, {
    action: sessionStatus === 'expired' ? 'upload_expired' : 'upload_aborted',
    actorID,
    assetID: relationID(session.asset),
    eventKey: `upload-session:${session.id}:${sessionStatus}`,
    organisationID: optionalRelationID(session.organisation) ?? undefined,
    occurredAt,
  })
}

async function requirePendingSession(
  payload: Payload,
  owner: Member,
  uploadSessionId: UploadSessionId,
  providers: MediaProviders,
): Promise<UploadSession> {
  const session = await findAccessibleSession(payload, owner, uploadSessionId)
  if (session.status === 'completed') throw new MediaLibraryError('Upload already completed.', 409)
  if (session.status === 'aborted') throw new MediaLibraryError('Upload session was aborted.', 410)
  if (session.status === 'expired' || new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session.status === 'pending') {
      await terminateUpload(payload, session, providers, 'expired', 'expired')
    }
    throw new MediaLibraryError('Upload session has expired. Start a new upload.', 410)
  }
  return session
}

export async function createUploadSession(
  payload: Payload,
  owner: Member,
  input: UploadMetadata,
  providers: MediaProviders = getMediaProviders(),
) {
  await assertMediaActivityAllowed(payload)
  const organisation = await organisationUploadDetails(payload, owner, input)
  const folder = await folderForUpload(payload, owner, input, organisation?.organisationID)
  const metadata = validateMetadata(input, organisation?.maximumUploadSizeBytes ?? MAX_ASSET_BYTES)
  await cleanupAbandonedUploads(payload, new Date(), providers)
  const now = new Date()
  const mediaAssetId = newMediaAssetId()
  const uploadSessionId = newUploadSessionId()
  const initiated = await providers.storage.initiateMultipart({ metadata, uploadSessionId })

  let asset: MediaAsset | null = null
  try {
    asset = await payload.create({
      collection: 'media-assets',
      data: {
        expiresAt: organisation?.expiresAt,
        fileName: metadata.fileName,
        folder: folder?.id,
        mediaAssetId,
        mediaProtectionPolicy: organisation?.mediaProtectionPolicy ?? 'protected',
        mimeType: metadata.mimeType,
        organisation: organisation?.organisationID,
        owner: owner.id,
        size: metadata.size,
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
        fileFingerprint: metadata.fileFingerprint,
        fileName: metadata.fileName,
        folder: folder?.id,
        mediaProtectionPolicy: organisation?.mediaProtectionPolicy ?? 'protected',
        mimeType: metadata.mimeType,
        organisation: organisation?.organisationID,
        owner: owner.id,
        partSize: initiated.partSize,
        providerUploadId: initiated.providerUploadId,
        providerUploadData: initiated.providerUploadData,
        retentionDays: organisation?.retentionDays,
        size: metadata.size,
        status: 'pending',
        uploadSessionId,
      },
      overrideAccess: true,
    })
    await recordAuditEvent(payload, {
      action: 'upload_started',
      actorID: owner.id,
      assetID: asset.id,
      eventKey: `upload-session:${session.id}:started`,
      organisationID: organisation?.organisationID,
      occurredAt: now,
    })
    return sessionResponse(session, asset)
  } catch (error) {
    await providers.storage.abortMultipart(initiated.providerUploadId, initiated.providerUploadData)
    if (asset) {
      await payload.delete({ collection: 'media-assets', id: asset.id, overrideAccess: true })
    }
    throw error
  }
}

async function findAccessibleSession(
  payload: Payload,
  member: Member,
  uploadSessionId: UploadSessionId,
): Promise<UploadSession> {
  const result = await payload.find({
    collection: 'upload-sessions',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { uploadSessionId: { equals: uploadSessionId } },
  })
  const session = result.docs[0]
  if (!session) throw new MediaLibraryError('Upload session not found.', 404)
  const asset = await payload.findByID({
    collection: 'media-assets',
    depth: 0,
    id: relationID(session.asset),
    overrideAccess: true,
  })
  const organisationID = optionalRelationID(asset.organisation)
  if (organisationID) {
    if (optionalRelationID(session.organisation) !== organisationID) {
      throw new MediaLibraryError('Upload session is not Organisation-scoped.', 409)
    }
    await authorizeOrganisationMedia(payload, member, { assetID: asset.id, operation: 'manage' })
    return session
  }
  if (relationID(session.owner) !== member.id) {
    throw new MediaLibraryError('Upload session not found.', 404)
  }
  return session
}

export async function resumeUploadSession(
  payload: Payload,
  owner: Member,
  uploadSessionId: UploadSessionId,
  fileFingerprint: string,
  providers: MediaProviders = getMediaProviders(),
) {
  await assertMediaActivityAllowed(payload)
  const session = await requirePendingSession(payload, owner, uploadSessionId, providers)
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
      await providers.storage.listParts(providerUploadID(session), providerUploadData(session)),
    )
  } catch (error) {
    if (error instanceof MultipartUploadError) {
      throw new MediaLibraryError('The resumable upload is no longer available. Start again.', 410)
    }
    throw error
  }
}

function validatePartNumber(session: UploadSession, partNumber: number): void {
  const maximumParts = Math.ceil(MAX_ASSET_BYTES / session.partSize)
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > maximumParts) {
    throw new MediaLibraryError('Invalid upload part number.', 400)
  }
}

export async function renewUploadPart(
  payload: Payload,
  owner: Member,
  uploadSessionId: UploadSessionId,
  partNumber: number,
  part: { checksumSHA256?: string; size?: number } = {},
  providers: MediaProviders = getMediaProviders(),
) {
  await assertMediaActivityAllowed(payload)
  const session = await requirePendingSession(payload, owner, uploadSessionId, providers)
  validatePartNumber(session, partNumber)
  try {
    return await providers.storage.createPartUploadTarget({
      checksumSHA256: part.checksumSHA256,
      partNumber,
      providerUploadData: providerUploadData(session),
      providerUploadId: providerUploadID(session),
      size: part.size,
      uploadSessionId,
    })
  } catch (error) {
    if (error instanceof MultipartUploadError) {
      throw new MediaLibraryError('Upload part metadata could not be validated.', 400)
    }
    throw error
  }
}

export async function receiveUploadPart(
  payload: Payload,
  owner: Member,
  uploadSessionId: UploadSessionId,
  partNumber: number,
  bytes: Uint8Array,
  providers: MediaProviders = getMediaProviders(),
  part: { checksumSHA256?: string } = {},
): Promise<CompletedPart> {
  await assertMediaActivityAllowed(payload)
  const session = await requirePendingSession(payload, owner, uploadSessionId, providers)
  validatePartNumber(session, partNumber)
  if (bytes.byteLength > session.partSize) {
    throw new MediaLibraryError(`Upload parts may not exceed ${session.partSize} bytes.`, 400)
  }
  const receiver = providers.storage as StorageProvider & {
    receivePart?: (input: {
      bytes: Uint8Array
      checksumSHA256?: string
      partNumber: number
      providerUploadId: ProviderUploadId
    }) => Promise<CompletedPart>
  }
  if (!receiver.receivePart) {
    throw new MediaLibraryError('This upload target does not accept proxied parts.', 404)
  }
  try {
    return await receiver.receivePart({
      bytes,
      checksumSHA256: part.checksumSHA256,
      partNumber,
      providerUploadId: providerUploadID(session),
    })
  } catch (error) {
    if (error instanceof MultipartUploadError)
      throw new MediaLibraryError('Uploaded parts could not be validated.', 400)
    throw error
  }
}

async function rejectCompletedUpload(
  payload: Payload,
  session: UploadSession,
  providers: MediaProviders,
  message: string,
): Promise<never> {
  await terminateUpload(payload, session, providers, 'aborted', 'failed')
  throw new MediaLibraryError(message, 400)
}

export async function completeUpload(
  payload: Payload,
  owner: Member,
  uploadSessionId: UploadSessionId,
  parts: CompletedPart[],
  providers: MediaProviders = getMediaProviders(),
  processingOptions: ProcessingOptions = {},
): Promise<MediaAssetSummary> {
  await assertMediaActivityAllowed(payload)
  const session = await requirePendingSession(payload, owner, uploadSessionId, providers)
  const normalizedParts = [...parts].sort((left, right) => left.partNumber - right.partNumber)
  let stored
  try {
    stored = await providers.storage.completeMultipart({
      parts: normalizedParts,
      providerUploadData: providerUploadData(session),
      providerUploadId: providerUploadID(session),
    })
  } catch (error) {
    if (error instanceof MultipartUploadError)
      throw new MediaLibraryError('Uploaded parts could not be validated.', 400)
    throw error
  }

  let probe
  try {
    probe = await providers.storage.probe(stored.objectKey)
  } catch (error) {
    if (error instanceof InvalidMediaError) {
      return rejectCompletedUpload(
        payload,
        session,
        providers,
        'The completed video could not be validated.',
      )
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
  if (
    !Number.isFinite(probe.durationSeconds) ||
    probe.durationSeconds <= 0 ||
    probe.durationSeconds > MAX_DURATION_SECONDS
  ) {
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
      data: newProcessingJobData({
        asset,
        objectKey: stored.objectKey,
        ownerID: relationID(asset.owner),
        processingJobId,
        queuedAt,
        source: {
          durationSeconds: probe.durationSeconds,
          height: probe.height,
          width: probe.width,
        },
      }),
      overrideAccess: true,
      req,
    })
    queuedAsset = await payload.update({
      collection: 'media-assets',
      data: {
        durationSeconds: probe.durationSeconds,
        mimeType: probe.mimeType,
        size: probe.size,
        status: 'queued',
        statusChangedAt: queuedAt.toISOString(),
        verifiedAt: queuedAt.toISOString(),
      },
      id: asset.id,
      overrideAccess: true,
      req,
    })
    await payload.db.commitTransaction(transactionID)
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }

  await Promise.all([
    recordAuditEvent(payload, {
      action: 'upload_completed',
      actorID: owner.id,
      assetID: asset.id,
      eventKey: `upload-session:${session.id}:completed`,
      organisationID: optionalRelationID(asset.organisation) ?? undefined,
      occurredAt: queuedAt,
    }),
    recordAuditEvent(payload, {
      action: 'processing_queued',
      actorID: owner.id,
      assetID: asset.id,
      eventKey: `processing-job:${processingJobId}:queued`,
      organisationID: optionalRelationID(asset.organisation) ?? undefined,
      occurredAt: queuedAt,
    }),
  ])

  await runProcessingCycle(payload, {
    ...processingOptions,
    now: queuedAt,
    provider: processingOptions.provider ?? providers.transcode,
  })
  return summary(queuedAsset)
}

export async function abortUpload(
  payload: Payload,
  owner: Member,
  uploadSessionId: UploadSessionId,
  providers: MediaProviders = getMediaProviders(),
): Promise<void> {
  const session = await findAccessibleSession(payload, owner, uploadSessionId)
  if (
    session.status === 'completed' ||
    session.status === 'aborted' ||
    session.status === 'expired'
  )
    return
  await terminateUpload(payload, session, providers, 'aborted', 'failed', owner.id)
}

export async function cleanupAbandonedUploads(
  payload: Payload,
  now = new Date(),
  providers: MediaProviders = getMediaProviders(),
): Promise<number> {
  let cleaned = 0
  while (true) {
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
    if (expired.docs.length === 0) return cleaned
    for (const session of expired.docs) {
      await terminateUpload(payload, session, providers, 'expired', 'expired')
      cleaned += 1
    }
  }
}

export async function listVisibleAssets(
  payload: Payload,
  member: Member,
  organisationID?: number,
): Promise<MediaAssetSummary[]> {
  if (organisationID !== undefined) {
    await authorizeOrganisationMedia(payload, member, { operation: 'browse', organisationID })
  }
  const result = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    sort: '-createdAt',
    where:
      organisationID === undefined
        ? { status: { not_equals: 'deleted' } }
        : {
            and: [
              { organisation: { equals: organisationID } },
              { status: { not_equals: 'deleted' } },
            ],
          },
  })
  const visible = await Promise.all(
    result.docs.map(async (asset) => {
      if (!asset.organisation) return null
      try {
        await authorizeOrganisationMedia(payload, member, { assetID: asset.id, operation: 'read' })
        return asset
      } catch {
        return null
      }
    }),
  )
  return visible.filter((asset): asset is MediaAsset => asset !== null).map(summary)
}

export async function getVisibleAsset(
  payload: Payload,
  member: Member,
  mediaAssetId: MediaAssetId,
): Promise<MediaAssetDetail> {
  const result = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [{ mediaAssetId: { equals: mediaAssetId } }, { status: { not_equals: 'deleted' } }],
    },
  })
  const asset = result.docs[0]
  if (!asset) throw new MediaLibraryError('Media Asset not found.', 404)
  if (!asset.organisation) throw new MediaLibraryError('Media Asset not found.', 404)
  const authorization = await authorizeOrganisationMedia(payload, member, {
    assetID: asset.id,
    operation: 'read',
  })
  const canManage = authorization.role !== 'viewer'
  const canShare = authorization.role === 'administrator' || authorization.role === 'publisher'
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
    assetID: asset.id,
    canRetry: asset.status === 'failed' && Boolean(session.objectKey),
    canManage,
    canShare,
    dispatchedAt: jobs.docs[0]?.dispatchedAt ?? null,
    failureMessage: jobs.docs[0]?.failureMessage ?? null,
    mimeType: asset.mimeType,
    organisationID: optionalRelationID(asset.organisation),
    processingJobId: (jobs.docs[0]?.processingJobId as MediaAssetDetail['processingJobId']) ?? null,
    providerJobId: (jobs.docs[0]?.providerJobId as MediaAssetDetail['providerJobId']) ?? null,
    readyAt: jobs.docs[0]?.readyAt ?? null,
    renditions: (jobs.docs[0]?.renditions as MediaAssetDetail['renditions']) ?? null,
    uploadSessionId: session.uploadSessionId as UploadSessionId,
  }
}

export async function getVisibleAssetThumbnail(
  payload: Payload,
  member: Member,
  mediaAssetId: MediaAssetId,
  providers: MediaProviders = getMediaProviders(),
): Promise<Uint8Array | null> {
  const asset = await getVisibleAsset(payload, member, mediaAssetId)
  if (asset.status !== 'ready' || !asset.processingJobId) return null
  return providers.storage.readOutputThumbnail(processingOutputPrefix(asset.processingJobId))
}

export async function retryVisibleAssetProcessing(
  payload: Payload,
  member: Member,
  mediaAssetId: MediaAssetId,
  processingOptions: ProcessingOptions = {},
): Promise<MediaAssetSummary> {
  await assertMediaActivityAllowed(payload)
  const result = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { mediaAssetId: { equals: mediaAssetId } },
  })
  const asset = result.docs[0]
  if (!asset) throw new MediaLibraryError('Media Asset not found.', 404)
  if (!asset.organisation) throw new MediaLibraryError('Media Asset not found.', 404)
  await authorizeOrganisationMedia(payload, member, { assetID: asset.id, operation: 'manage' })
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
  await recordAuditEvent(payload, {
    action: 'processing_retried',
    actorID: member.id,
    assetID: asset.id,
    eventKey: `processing-job:${job.processingJobId}:manual-retry:${now.toISOString()}`,
    occurredAt: now,
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
