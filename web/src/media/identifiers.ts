import { randomUUID } from 'node:crypto'

export type MediaAssetId = `asset_${string}`
export type UploadSessionId = `upload_${string}`
export type ProcessingJobId = `processing_${string}`
export type ProviderJobId = `provider_job_${string}`
export type ProviderUploadId = `provider_upload_${string}`
export type PlaybackGrantId = `playback_${string}`

export function newMediaAssetId(): MediaAssetId {
  return `asset_${randomUUID()}`
}

export function newUploadSessionId(): UploadSessionId {
  return `upload_${randomUUID()}`
}

export function newProcessingJobId(): ProcessingJobId {
  return `processing_${randomUUID()}`
}

export function newPlaybackGrantId(): PlaybackGrantId {
  return `playback_${randomUUID()}`
}

export function parseMediaAssetId(value: string): MediaAssetId | null {
  return /^asset_[0-9a-f-]{36}$/.test(value) ? (value as MediaAssetId) : null
}

export function parseUploadSessionId(value: string): UploadSessionId | null {
  return /^upload_[0-9a-f-]{36}$/.test(value) ? (value as UploadSessionId) : null
}

export function parsePlaybackGrantId(value: string): PlaybackGrantId | null {
  return /^playback_[0-9a-f-]{36}$/.test(value) ? (value as PlaybackGrantId) : null
}
