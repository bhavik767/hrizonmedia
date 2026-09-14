import 'server-only'

import type { MediaAssetId, ProviderJobId, ProviderUploadId, UploadSessionId } from '../identifiers'
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
  initiateMultipart(input: {
    metadata: UploadMetadata
    uploadSessionId: UploadSessionId
  }): Promise<MultipartUpload>
  listParts(providerUploadId: ProviderUploadId): Promise<CompletedPart[]>
  probe(objectKey: string): Promise<MediaProbe>
}

export interface TranscodeProvider {
  queue(input: {
    idempotencyKey: string
    mediaAssetId: MediaAssetId
    objectKey: string
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

export interface MediaProviders {
  storage: StorageProvider
  transcode: TranscodeProvider
}
