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
  mediaAssetId: string
  size: number
  status: MediaAssetStatus
}

export interface MediaAssetDetail extends MediaAssetSummary {
  mimeType: string
  providerJobId: string | null
  uploadSessionId: string
}
