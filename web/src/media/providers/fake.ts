import 'server-only'

import { createHash } from 'node:crypto'

import type { ProviderJobId } from '../identifiers'
import type { SourceMedia, StorageProvider, TranscodeProvider } from './contracts'

const MP4_SIGNATURE = new TextEncoder().encode('ftyp')
const MKV_SIGNATURE = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])

function hasBytesAt(bytes: Uint8Array, signature: Uint8Array, offset: number): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

export class InvalidMediaError extends Error {}
export class TransientTranscodeError extends Error {}
export class PermanentTranscodeError extends Error {}

function fakeSource(bytes: Uint8Array): SourceMedia {
  const marker = new TextDecoder().decode(bytes).match(/HRIZON:(\d+)x(\d+):(\d+)/)
  if (!marker) return { durationSeconds: 5, height: 1080, width: 1920 }
  return {
    durationSeconds: Number(marker[3]),
    height: Number(marker[2]),
    width: Number(marker[1]),
  }
}

export const fakeStorageProvider: StorageProvider = {
  async store({ bytes, metadata, uploadSessionId }) {
    const isMP4 = metadata.mimeType === 'video/mp4' && hasBytesAt(bytes, MP4_SIGNATURE, 4)
    const isMKV = metadata.mimeType === 'video/x-matroska' && hasBytesAt(bytes, MKV_SIGNATURE, 0)

    if (!isMP4 && !isMKV) {
      throw new InvalidMediaError('The selected file is not a valid MP4 or MKV video.')
    }

    return {
      objectKey: `fake-private/${uploadSessionId}/${encodeURIComponent(metadata.fileName)}`,
      source: fakeSource(bytes),
    }
  },
}

export const fakeTranscodeProvider: TranscodeProvider = {
  async queue({ idempotencyKey, mediaAssetId, objectKey, renditions }) {
    const digest = createHash('sha256')
      .update(`${idempotencyKey}\0${mediaAssetId}\0${objectKey}\0${JSON.stringify(renditions)}`)
      .digest('hex')
    return `provider_job_${digest.slice(0, 32)}` as ProviderJobId
  },
  async status({ now, source, startedAt }) {
    const processingTime = source.durationSeconds * 1_400
    return now.getTime() - startedAt.getTime() >= processingTime ? 'ready' : 'processing'
  },
}

export function getFakeProviders(environment: NodeJS.ProcessEnv = process.env) {
  const railwayEnvironment = environment.RAILWAY_ENVIRONMENT_NAME?.toLowerCase()
  if (environment.NODE_ENV === 'production' && railwayEnvironment !== 'staging') {
    throw new Error('Deterministic fake media providers are prohibited in production.')
  }

  return { storage: fakeStorageProvider, transcode: fakeTranscodeProvider }
}
