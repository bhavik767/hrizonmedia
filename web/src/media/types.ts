import type { MediaAssetId, ProcessingJobId, ProviderJobId, UploadSessionId } from './identifiers'

export const mediaAssetStatuses = [
  'uploading',
  'queued',
  'processing',
  'ready',
  'failed',
  'expired',
  'deleted',
] as const

export type MediaAssetStatus = (typeof mediaAssetStatuses)[number]

export interface MediaAssetSummary {
  createdAt: string
  fileName: string
  mediaAssetId: MediaAssetId
  size: number
  status: MediaAssetStatus
}

export interface MediaAssetDetail extends MediaAssetSummary {
  mimeType: string
  processingJobId: ProcessingJobId | null
  providerJobId: ProviderJobId | null
  uploadSessionId: UploadSessionId
}

export interface UploadMetadata {
  fileName: string
  mimeType: string
  size: number
}

export interface UploadedFile {
  arrayBuffer(): Promise<ArrayBuffer>
  name: string
  size: number
  type: string
}
