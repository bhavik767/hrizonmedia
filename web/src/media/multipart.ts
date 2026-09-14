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
