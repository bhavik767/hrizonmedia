import 'server-only'

import type {
  DeliveryToken,
  MediaAssetId,
  PlaybackGrantId,
  ProcessingJobId,
  ProviderJobId,
  ProviderUploadId,
  UploadSessionId,
} from '../identifiers'
import type { CompletedPart, PartUploadTarget } from '../multipart'
import type { UploadMetadata } from '../types'
import type { ProtectedPlaybackBrowser } from '../playback-browser'

export interface MultipartUpload {
  partSize: number
  providerUploadData?: string
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
  height: 240 | 270 | 360 | 480 | 720 | 1080
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
  abortMultipart(providerUploadId: ProviderUploadId, providerUploadData?: string): Promise<void>
  completeMultipart(input: {
    parts: CompletedPart[]
    providerUploadData?: string
    providerUploadId: ProviderUploadId
  }): Promise<StoredUpload>
  createPartUploadTarget(input: {
    checksumSHA256?: string
    partNumber: number
    providerUploadData?: string
    providerUploadId: ProviderUploadId
    size?: number
    uploadSessionId: UploadSessionId
  }): Promise<PartUploadTarget>
  deleteObject(objectKey: string): Promise<void>
  deletePrefix(prefix: string): Promise<void>
  initiateMultipart(input: {
    metadata: UploadMetadata
    uploadSessionId: UploadSessionId
  }): Promise<MultipartUpload>
  listParts(
    providerUploadId: ProviderUploadId,
    providerUploadData?: string,
  ): Promise<CompletedPart[]>
  probe(objectKey: string): Promise<MediaProbe>
}

export interface TranscodeProvider {
  deleteOutputs(input: {
    mediaAssetId: MediaAssetId
    processingJobId?: ProcessingJobId
    providerJobId: ProviderJobId | null
  }): Promise<void>
  queue(input: {
    attempt: number
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
  resourceAuthorization?: {
    origin: string
    pathPrefix: string
    query: string
  }
}

export interface DeliveryProvider {
  authorize(input: {
    expiresAt: Date
    mediaAssetId: MediaAssetId
    playbackGrantId: PlaybackGrantId
    processingJobId?: ProcessingJobId
    manifestFormat: ProtectedPlaybackBrowser['manifestFormat']
    token: DeliveryToken
  }): Promise<DeliveryAuthorization>
  revokeAsset(mediaAssetId: MediaAssetId): Promise<void>
}

interface BaseDrmPlaybackContract {
  distinctiveIdentifier: 'not-allowed'
  hdcpRequired: false
  licenceURL: string
  persistentState: 'not-allowed'
  sessionType: 'temporary'
}

export type DrmPlaybackContract =
  | (BaseDrmPlaybackContract & {
      keySystem: 'com.widevine.alpha'
      manifestFormat: 'dash'
    })
  | (BaseDrmPlaybackContract & {
      fairPlayCertificateURL: string
      keySystem: 'com.apple.fps'
      manifestFormat: 'hls'
    })

export interface DrmProvider {
  acquireTemporaryLicence(input: {
    browser: ProtectedPlaybackBrowser
    challenge: Uint8Array
    drmContentId: string
    playbackGrantId: PlaybackGrantId
  }): Promise<Uint8Array>
  createPlaybackContract(input: {
    browser: ProtectedPlaybackBrowser
    playbackGrantId: PlaybackGrantId
  }): DrmPlaybackContract
}

export interface MediaProviders {
  delivery: DeliveryProvider
  drm: DrmProvider
  storage: StorageProvider
  transcode: TranscodeProvider
}
