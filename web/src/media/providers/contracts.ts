import type { MediaAssetId, ProviderJobId, UploadSessionId } from '../identifiers'

export interface StoredUpload {
  objectKey: string
}

export interface StorageProvider {
  store(input: {
    bytes: Uint8Array
    fileName: string
    mimeType: string
    uploadSessionId: UploadSessionId
  }): Promise<StoredUpload>
}

export interface TranscodeProvider {
  queue(input: { mediaAssetId: MediaAssetId; objectKey: string }): Promise<ProviderJobId>
}
