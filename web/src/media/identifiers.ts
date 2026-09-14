import { randomUUID } from 'node:crypto'

export type MediaAssetId = `asset_${string}`
export type UploadSessionId = `upload_${string}`
export type ProviderJobId = `job_${string}`

export function newMediaAssetId(): MediaAssetId {
  return `asset_${randomUUID()}`
}

export function newUploadSessionId(): UploadSessionId {
  return `upload_${randomUUID()}`
}

export function newProviderJobId(): ProviderJobId {
  return `job_${randomUUID()}`
}
