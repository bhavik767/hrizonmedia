export const MULTIPART_PART_SIZE_BYTES = 16 * 1024 * 1024
export const MAX_MULTIPART_PARTS = 128

export interface CompletedPart {
  checksumSHA256: string
  etag: string
  partNumber: number
  size: number
}

export interface PartUploadTarget {
  headers: Record<string, string>
  uploadURL: string
}
