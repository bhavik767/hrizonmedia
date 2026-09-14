import { newProviderJobId } from '../identifiers'
import type { StorageProvider, TranscodeProvider } from './contracts'

const MP4_SIGNATURE = new TextEncoder().encode('ftyp')
const MKV_SIGNATURE = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])

function hasBytesAt(bytes: Uint8Array, signature: Uint8Array, offset: number): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

export class InvalidMediaError extends Error {}

export const fakeStorageProvider: StorageProvider = {
  async store({ bytes, fileName, mimeType, uploadSessionId }) {
    const isMP4 = mimeType === 'video/mp4' && hasBytesAt(bytes, MP4_SIGNATURE, 4)
    const isMKV = mimeType === 'video/x-matroska' && hasBytesAt(bytes, MKV_SIGNATURE, 0)

    if (!isMP4 && !isMKV) {
      throw new InvalidMediaError('The selected file is not a valid MP4 or MKV video.')
    }

    return { objectKey: `fake-private/${uploadSessionId}/${encodeURIComponent(fileName)}` }
  },
}

export const fakeTranscodeProvider: TranscodeProvider = {
  async queue() {
    return newProviderJobId()
  },
}

export function getFakeProviders() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Deterministic fake media providers are prohibited in production.')
  }

  return { storage: fakeStorageProvider, transcode: fakeTranscodeProvider }
}
