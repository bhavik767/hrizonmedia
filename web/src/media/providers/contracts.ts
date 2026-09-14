import 'server-only'

import type { MediaAssetId, ProviderJobId, UploadSessionId } from '../identifiers'
import type { UploadMetadata } from '../types'

export interface CompletedPart {
  etag: string
  partNumber: number
  size: number
}

export interface MultipartUpload {
  partSize: number
  providerUploadId: string
}

export interface StoredUpload {
  objectKey: string
}

export interface MediaProbe {
  durationSeconds: number
  mimeType: 'video/mp4' | 'video/x-matroska'
  size: number
}

export interface StorageProvider {
  abortMultipart(providerUploadId: string): Promise<void>
  completeMultipart(input: {
    parts: CompletedPart[]
    providerUploadId: string
  }): Promise<StoredUpload>
  initiateMultipart(input: {
    metadata: UploadMetadata
    uploadSessionId: UploadSessionId
  }): Promise<MultipartUpload>
  listParts(providerUploadId: string): Promise<CompletedPart[]>
  probe(objectKey: string): Promise<MediaProbe>
  uploadPart(input: {
    bytes: Uint8Array
    partNumber: number
    providerUploadId: string
  }): Promise<CompletedPart>
}

export interface TranscodeProvider {
  queue(input: { mediaAssetId: MediaAssetId; objectKey: string }): Promise<ProviderJobId>
}

export interface MediaProviders {
  storage: StorageProvider
  transcode: TranscodeProvider
}
