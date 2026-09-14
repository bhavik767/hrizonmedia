import 'server-only'

import type { MediaAssetId, ProviderJobId, UploadSessionId } from '../identifiers'
import type { UploadMetadata } from '../types'

export interface StoredUpload {
  objectKey: string
  source: SourceMedia
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

export interface StorageProvider {
  store(input: {
    bytes: Uint8Array
    metadata: UploadMetadata
    uploadSessionId: UploadSessionId
  }): Promise<StoredUpload>
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
