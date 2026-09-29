export const MULTIPART_PART_SIZE_BYTES = 16 * 1024 * 1024
export const MAX_MULTIPART_PARTS = 128

export function multipartPartCount(sourceSize: number): number {
  return Math.ceil(sourceSize / MULTIPART_PART_SIZE_BYTES)
}

export function expectedMultipartPartSize(sourceSize: number, partNumber: number): number | null {
  const totalParts = multipartPartCount(sourceSize)
  if (
    !Number.isSafeInteger(sourceSize) ||
    sourceSize < 1 ||
    !Number.isSafeInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > totalParts
  ) {
    return null
  }
  return partNumber === totalParts
    ? sourceSize - MULTIPART_PART_SIZE_BYTES * (totalParts - 1)
    : MULTIPART_PART_SIZE_BYTES
}

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
