export class InvalidMediaError extends Error {}
export class MultipartUploadError extends Error {}
export class PermanentTranscodeError extends Error {}
export class TransientTranscodeError extends Error {}
export class FailedTranscodeJobError extends TransientTranscodeError {}

export type TranscodeMetadataReason =
  | 'attempt'
  | 'callback_origin'
  | 'callback_secret'
  | 'idempotency_key'
  | 'media_asset_id'
  | 'object_key'
  | 'output_prefix'
  | 'renditions'
  | 'source'

export class InvalidTranscodeMetadataError extends PermanentTranscodeError {
  constructor(public readonly reason: TranscodeMetadataReason) {
    super('Transcode job metadata is invalid.')
    this.name = 'InvalidTranscodeMetadataError'
  }
}
