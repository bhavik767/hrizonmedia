import 'server-only'

import { randomUUID } from 'node:crypto'

import type { ProviderUploadId, UploadSessionId } from '../identifiers'
import { MultipartUploadError } from './errors'

export interface S3UploadDescriptor {
  key: string
  mimeType: 'video/mp4' | 'video/x-matroska'
  nativeUploadId: string
  providerUploadId: ProviderUploadId
  size: number
  uploadSessionId: UploadSessionId
  version: 1
}

export function newS3UploadState(input: {
  key: string
  mimeType: S3UploadDescriptor['mimeType']
  nativeUploadId: string
  size: number
  uploadSessionId: UploadSessionId
}): { providerUploadData: string; providerUploadId: ProviderUploadId } {
  const providerUploadId = `provider_upload_${randomUUID()}` as ProviderUploadId
  return {
    providerUploadData: Buffer.from(
      JSON.stringify({ ...input, providerUploadId, version: 1 }),
    ).toString('base64url'),
    providerUploadId,
  }
}

export function readS3UploadState(
  providerUploadId: ProviderUploadId,
  providerUploadData: string | undefined,
): S3UploadDescriptor {
  try {
    if (!providerUploadData) throw new Error('missing')
    const descriptor = JSON.parse(
      Buffer.from(providerUploadData, 'base64url').toString('utf8'),
    ) as S3UploadDescriptor
    if (
      descriptor.version !== 1 ||
      descriptor.providerUploadId !== providerUploadId ||
      !/^provider_upload_[0-9a-f-]{36}$/.test(descriptor.providerUploadId) ||
      !/^upload_[0-9a-f-]{36}$/.test(descriptor.uploadSessionId) ||
      !/^sources\/upload_[0-9a-f-]{36}\/source\.(mp4|mkv)$/.test(descriptor.key) ||
      !descriptor.nativeUploadId ||
      !Number.isSafeInteger(descriptor.size) ||
      descriptor.size <= 0 ||
      !['video/mp4', 'video/x-matroska'].includes(descriptor.mimeType)
    ) {
      throw new Error('shape')
    }
    return descriptor
  } catch {
    throw new MultipartUploadError('Multipart upload state is invalid.')
  }
}

export function validateOutputPrefix(prefix: string): void {
  if (!/^outputs\/processing_[0-9a-f-]{36}\/$/.test(prefix)) {
    throw new MultipartUploadError('Output prefix is invalid.')
  }
}

export function validateSourceKey(objectKey: string): void {
  if (!/^sources\/upload_[0-9a-f-]{36}\/source\.(mp4|mkv)$/.test(objectKey)) {
    throw new MultipartUploadError('Source object key is invalid.')
  }
}
