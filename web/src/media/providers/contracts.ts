import 'server-only'

import type {
  DeliveryToken,
  MediaAssetId,
  PlaybackGrantId,
  ProviderJobId,
  ProviderUploadId,
  UploadSessionId,
} from '../identifiers'
import type { CompletedPart, PartUploadTarget } from '../multipart'
import type { UploadMetadata } from '../types'

export interface MultipartUpload {
  partSize: number
  providerUploadId: ProviderUploadId
}

export interface StoredUpload {
  objectKey: string
}

export interface SourceMedia {
  durationSeconds: number
  height: number
  width: number
}

export interface Rendition {
  audioCodec: 'aac'
  height: 360 | 480 | 720 | 1080
  videoCodec: 'h264'
  width: number
}

export interface MediaProbe {
  durationSeconds: number
  height: number
  mimeType: 'video/mp4' | 'video/x-matroska'
  size: number
  width: number
}

export interface StorageProvider {
  abortMultipart(providerUploadId: ProviderUploadId): Promise<void>
  completeMultipart(input: {
    parts: CompletedPart[]
    providerUploadId: ProviderUploadId
  }): Promise<StoredUpload>
  createPartUploadTarget(input: {
    partNumber: number
    providerUploadId: ProviderUploadId
    uploadSessionId: UploadSessionId
  }): Promise<PartUploadTarget>
  deleteObject(objectKey: string): Promise<void>
  initiateMultipart(input: {
    metadata: UploadMetadata
    uploadSessionId: UploadSessionId
  }): Promise<MultipartUpload>
  listParts(providerUploadId: ProviderUploadId): Promise<CompletedPart[]>
  probe(objectKey: string): Promise<MediaProbe>
}

export interface TranscodeProvider {
  deleteOutputs(input: {
    mediaAssetId: MediaAssetId
    providerJobId: ProviderJobId | null
  }): Promise<void>
  queue(input: {
    idempotencyKey: string
    mediaAssetId: MediaAssetId
    objectKey: string
    outputPrefix: string
    renditions: Rendition[]
    source: SourceMedia
  }): Promise<ProviderJobId>
  status(input: {
    now: Date
    providerJobId: ProviderJobId
    source: SourceMedia
    startedAt: Date
  }): Promise<'processing' | 'ready'>
}

export interface DeliveryAuthorization {
  expiresAt: string
  manifestURL: string
}

export interface DeliveryProvider {
  authorize(input: {
    expiresAt: Date
    mediaAssetId: MediaAssetId
    playbackGrantId: PlaybackGrantId
    token: DeliveryToken
  }): Promise<DeliveryAuthorization>
  revokeAsset(mediaAssetId: MediaAssetId): Promise<void>
}

export interface DrmPlaybackContract {
  distinctiveIdentifier: 'not-allowed'
  keySystem: 'com.widevine.alpha'
  licenceURL: string
  persistentState: 'not-allowed'
  sessionType: 'temporary'
}

export interface DrmProvider {
  acquireTemporaryLicence(input: {
    challenge: Uint8Array
    drmContentId: string
    playbackGrantId: PlaybackGrantId
  }): Promise<Uint8Array>
  createPlaybackContract(input: { playbackGrantId: PlaybackGrantId }): DrmPlaybackContract
}

export interface MediaProviders {
  delivery: DeliveryProvider
  drm: DrmProvider
  storage: StorageProvider
  transcode: TranscodeProvider
}
