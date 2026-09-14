import 'server-only'

import type { MediaAssetId, ProviderJobId, UploadSessionId } from '../identifiers'
import type { UploadMetadata } from '../types'

export interface StoredUpload {
  objectKey: string
}

export interface StorageProvider {
  store(input: {
    bytes: Uint8Array
    metadata: UploadMetadata
    uploadSessionId: UploadSessionId
  }): Promise<StoredUpload>
}

export interface TranscodeProvider {
  queue(input: { mediaAssetId: MediaAssetId; objectKey: string }): Promise<ProviderJobId>
}
