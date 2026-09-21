import { randomBytes, randomUUID } from 'node:crypto'

export type MediaAssetId = `asset_${string}`
export type UploadSessionId = `upload_${string}`
export type ProcessingJobId = `processing_${string}`
export type ProviderJobId = `provider_job_${string}`
export type ProviderUploadId = `provider_upload_${string}`
export type PlaybackGrantId = `playback_${string}`
export type LeakId = `lk_${string}`
declare const deliveryTokenBrand: unique symbol
declare const playbackGrantTokenBrand: unique symbol
export type DeliveryToken = string & { readonly [deliveryTokenBrand]: true }
export type PlaybackGrantToken = string & { readonly [playbackGrantTokenBrand]: true }

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

export function newLeakId(): LeakId {
  return `lk_${randomBytes(12).toString('base64url')}`
}

export function processingOutputPrefix(processingJobId: string): string {
  return `outputs/${processingJobId}/`
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
