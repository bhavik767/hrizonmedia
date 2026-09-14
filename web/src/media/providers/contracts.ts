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

export interface MediaProbe {
  durationSeconds: number
  mimeType: 'video/mp4' | 'video/x-matroska'
  size: number
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
  queue(input: { mediaAssetId: MediaAssetId; objectKey: string }): Promise<ProviderJobId>
}

export interface MediaProviders {
  storage: StorageProvider
  transcode: TranscodeProvider
}
