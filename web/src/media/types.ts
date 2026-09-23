import type { MediaAssetId, ProcessingJobId, ProviderJobId, UploadSessionId } from './identifiers'
import type { Rendition } from './providers/contracts'

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

export const mediaProtectionPolicies = ['protected', 'standard'] as const

export type MediaProtectionPolicy = (typeof mediaProtectionPolicies)[number]

export interface MediaAssetSummary {
  createdAt: string
  durationSeconds?: number | null
  folderID?: number | null
  organisationID?: number | null
  fileName: string
  mediaAssetId: MediaAssetId
  size: number
  status: MediaAssetStatus
}

export interface MediaFolderSummary {
  id: number
  name: string
  organisationID: number
}

export interface MediaAssetDetail extends MediaAssetSummary {
  assetID: number
  canRetry: boolean
  canManage: boolean
  canShare: boolean
  dispatchedAt: string | null
  failureMessage: string | null
  mimeType: string
  organisationID: number | null
  processingJobId: ProcessingJobId | null
  providerJobId: ProviderJobId | null
  readyAt: string | null
  renditions: Rendition[] | null
  uploadSessionId: UploadSessionId
}

export interface UploadMetadata {
  fileFingerprint: string
  fileName: string
  mediaProtectionPolicy?: MediaProtectionPolicy
  mimeType: string
  organisationID?: number
  folderID?: number
  retentionDays?: number
  size: number
}
