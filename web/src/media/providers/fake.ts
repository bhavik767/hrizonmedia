import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import type { ProviderJobId, ProviderUploadId } from '../identifiers'
import type { CompletedPart } from '../multipart'
import type { UploadMetadata } from '../types'
import type {
  DeliveryProvider,
  DrmProvider,
  Rendition,
  SourceMedia,
  StorageProvider,
  TranscodeProvider,
} from './contracts'
import { InvalidMediaError, MultipartUploadError } from './errors'

const FAKE_PART_SIZE = 5 * 1024 * 1024
const MP4_SIGNATURE = new TextEncoder().encode('ftyp')
const MKV_SIGNATURE = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])
const MVHD_SIGNATURE = new TextEncoder().encode('mvhd')

interface FakeMultipartUpload {
  metadata: UploadMetadata
  objectKey: string | null
  parts: Map<number, Uint8Array>
  partTargets: Map<number, { checksumSHA256: string; size: number }>
  uploadSessionId: string
}

interface FakeMediaState {
  objects: Map<string, Uint8Array>
  uploads: Map<ProviderUploadId, FakeMultipartUpload>
}

const fakeMediaStateKey = Symbol.for('hrizonmedia.fake-media-state')
const sharedGlobal = globalThis as typeof globalThis & { [fakeMediaStateKey]?: FakeMediaState }
const state = (sharedGlobal[fakeMediaStateKey] ??= { objects: new Map(), uploads: new Map() })

function sourceDimensions(bytes: Uint8Array): Pick<SourceMedia, 'height' | 'width'> {
  const marker = new TextDecoder().decode(bytes).match(/HRIZON:(\d+)x(\d+)/)
  return marker
    ? { height: Number(marker[2]), width: Number(marker[1]) }
    : { height: 1080, width: 1920 }
}

function hasBytesAt(bytes: Uint8Array, signature: Uint8Array, offset: number): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

function etag(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function partSummary(partNumber: number, bytes: Uint8Array): CompletedPart {
  const checksumSHA256 = etag(bytes)
  return { checksumSHA256, etag: checksumSHA256, partNumber, size: bytes.byteLength }
}

function readUInt64BE(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const value = view.getBigUint64(offset)
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new InvalidMediaError('Invalid duration.')
  return Number(value)
}

function probeMP4(bytes: Uint8Array): number | null {
  if (!hasBytesAt(bytes, MP4_SIGNATURE, 4)) return null
  for (let offset = 4; offset + 24 <= bytes.byteLength; offset += 1) {
    if (!hasBytesAt(bytes, MVHD_SIGNATURE, offset)) continue
    const content = offset + 4
    const version = bytes[content]
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (version === 0 && content + 20 <= bytes.byteLength) {
      const timescale = view.getUint32(content + 12)
      const duration = view.getUint32(content + 16)
      if (timescale > 0 && duration > 0) return duration / timescale
    }
    if (version === 1 && content + 32 <= bytes.byteLength) {
      const timescale = view.getUint32(content + 20)
      const duration = readUInt64BE(bytes, content + 24)
      if (timescale > 0 && duration > 0) return duration / timescale
    }
  }
  throw new InvalidMediaError('The completed MP4 has no valid duration metadata.')
}

function readVint(bytes: Uint8Array, offset: number): { length: number; value: number } | null {
  const first = bytes[offset]
  if (!first) return null
  let marker = 0x80
  let length = 1
  while (length <= 8 && (first & marker) === 0) {
    marker >>= 1
    length += 1
  }
  if (length > 8 || offset + length > bytes.byteLength) return null
  let value = first & (marker - 1)
  for (let index = 1; index < length; index += 1) value = value * 256 + bytes[offset + index]!
  return { length, value }
}

function findElement(bytes: Uint8Array, id: Uint8Array): Uint8Array | null {
  for (let offset = 0; offset + id.length < bytes.byteLength; offset += 1) {
    if (!hasBytesAt(bytes, id, offset)) continue
    const size = readVint(bytes, offset + id.length)
    if (!size) continue
    const start = offset + id.length + size.length
    if (start + size.value <= bytes.byteLength) return bytes.subarray(start, start + size.value)
  }
  return null
}

function probeMKV(bytes: Uint8Array): number | null {
  if (!hasBytesAt(bytes, MKV_SIGNATURE, 0)) return null
  const durationBytes = findElement(bytes, Uint8Array.from([0x44, 0x89]))
  if (!durationBytes || ![4, 8].includes(durationBytes.byteLength)) {
    throw new InvalidMediaError('The completed MKV has no valid duration metadata.')
  }
  const scaleBytes = findElement(bytes, Uint8Array.from([0x2a, 0xd7, 0xb1]))
  let timecodeScale = 1_000_000
  if (scaleBytes) {
    timecodeScale = 0
    for (const byte of scaleBytes) timecodeScale = timecodeScale * 256 + byte
  }
  const view = new DataView(
    durationBytes.buffer,
    durationBytes.byteOffset,
    durationBytes.byteLength,
  )
  const duration = durationBytes.byteLength === 4 ? view.getFloat32(0) : view.getFloat64(0)
  if (!Number.isFinite(duration) || duration <= 0 || timecodeScale <= 0) {
    throw new InvalidMediaError('The completed MKV has invalid duration metadata.')
  }
  return (duration * timecodeScale) / 1_000_000_000
}

function concatParts(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

function getUpload(providerUploadId: ProviderUploadId): FakeMultipartUpload {
  const upload = state.uploads.get(providerUploadId)
  if (!upload) throw new MultipartUploadError('Multipart upload not found.')
  return upload
}

export const fakeStorageProvider: StorageProvider & {
  receivePart(input: {
    bytes: Uint8Array
    checksumSHA256?: string
    partNumber: number
    providerUploadId: ProviderUploadId
  }): Promise<CompletedPart>
} = {
  async abortMultipart(providerUploadId) {
    const upload = state.uploads.get(providerUploadId)
    if (!upload) return
    if (upload.objectKey) state.objects.delete(upload.objectKey)
    state.uploads.delete(providerUploadId)
  },

  async completeMultipart({ parts, providerUploadId }) {
    const upload = getUpload(providerUploadId)
    if (upload.objectKey) return { objectKey: upload.objectKey }
    const orderedParts = [...parts].sort((left, right) => left.partNumber - right.partNumber)
    if (orderedParts.length === 0)
      throw new MultipartUploadError('At least one uploaded part is required.')
    const bytes = orderedParts.map((part, index) => {
      if (part.partNumber !== index + 1) {
        throw new MultipartUploadError('Uploaded parts must be consecutive.')
      }
      const stored = upload.parts.get(part.partNumber)
      if (
        !stored ||
        part.etag !== etag(stored) ||
        part.checksumSHA256 !== etag(stored) ||
        part.size !== stored.byteLength
      ) {
        throw new MultipartUploadError(`Uploaded part ${part.partNumber} does not match storage.`)
      }
      return stored
    })
    if (upload.parts.size !== orderedParts.length) {
      throw new MultipartUploadError('The completed upload omitted one or more stored parts.')
    }
    const object = concatParts(bytes)
    const objectKey = `fake-private/${upload.uploadSessionId}/${encodeURIComponent(upload.metadata.fileName)}`
    state.objects.set(objectKey, object)
    upload.objectKey = objectKey
    return { objectKey }
  },

  async createPartUploadTarget({
    checksumSHA256,
    partNumber,
    providerUploadId,
    size,
    uploadSessionId,
  }) {
    const upload = getUpload(providerUploadId)
    if (upload.uploadSessionId !== uploadSessionId) {
      throw new MultipartUploadError('Multipart upload does not belong to this session.')
    }
    const totalParts = Math.ceil(upload.metadata.size / FAKE_PART_SIZE)
    const expectedSize =
      partNumber === totalParts
        ? upload.metadata.size - FAKE_PART_SIZE * (totalParts - 1)
        : FAKE_PART_SIZE
    if (
      !checksumSHA256 ||
      !/^[0-9a-f]{64}$/.test(checksumSHA256) ||
      !Number.isSafeInteger(size) ||
      size !== expectedSize ||
      !Number.isSafeInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > totalParts
    ) {
      throw new MultipartUploadError('Upload part metadata is invalid.')
    }
    upload.partTargets.set(partNumber, { checksumSHA256, size })
    return {
      headers: {
        'content-type': 'application/octet-stream',
        'x-amz-checksum-sha256': Buffer.from(checksumSHA256, 'hex').toString('base64'),
      },
      uploadURL: `/api/demo/uploads/${uploadSessionId}/parts/${partNumber}/content`,
    }
  },

  async deleteObject(objectKey) {
    state.objects.delete(objectKey)
  },

  async deletePrefix(prefix) {
    for (const objectKey of state.objects.keys()) {
      if (objectKey.startsWith(prefix)) state.objects.delete(objectKey)
    }
  },

  async initiateMultipart({ metadata, uploadSessionId }) {
    const providerUploadId = `provider_upload_${randomUUID()}` as ProviderUploadId
    state.uploads.set(providerUploadId, {
      metadata,
      objectKey: null,
      parts: new Map(),
      partTargets: new Map(),
      uploadSessionId,
    })
    return { partSize: FAKE_PART_SIZE, providerUploadId }
  },

  async listParts(providerUploadId) {
    return [...getUpload(providerUploadId).parts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([partNumber, bytes]) => partSummary(partNumber, bytes))
  },

  async probe(objectKey) {
    const bytes = state.objects.get(objectKey)
    if (!bytes) throw new InvalidMediaError('The completed upload could not be read.')
    const mp4Duration = probeMP4(bytes)
    if (mp4Duration !== null) {
      return {
        durationSeconds: mp4Duration,
        mimeType: 'video/mp4',
        size: bytes.byteLength,
        ...sourceDimensions(bytes),
      }
    }
    const mkvDuration = probeMKV(bytes)
    if (mkvDuration !== null) {
      return {
        durationSeconds: mkvDuration,
        mimeType: 'video/x-matroska',
        size: bytes.byteLength,
        ...sourceDimensions(bytes),
      }
    }
    throw new InvalidMediaError('The completed upload is not a valid MP4 or MKV video.')
  },

  async receivePart({ bytes, checksumSHA256, partNumber, providerUploadId }) {
    if (!Number.isSafeInteger(partNumber) || partNumber < 1) {
      throw new MultipartUploadError('Part number must be a positive integer.')
    }
    if (bytes.byteLength === 0 || bytes.byteLength > FAKE_PART_SIZE) {
      throw new MultipartUploadError(`Each part must contain at most ${FAKE_PART_SIZE} bytes.`)
    }
    const upload = getUpload(providerUploadId)
    if (upload.objectKey) throw new MultipartUploadError('Multipart upload is already complete.')
    const target = upload.partTargets.get(partNumber)
    if (
      target &&
      (target.size !== bytes.byteLength ||
        target.checksumSHA256 !== checksumSHA256 ||
        target.checksumSHA256 !== etag(bytes))
    ) {
      throw new MultipartUploadError('Upload part does not match its signed target.')
    }
    const copied = Uint8Array.from(bytes)
    upload.parts.set(partNumber, copied)
    return partSummary(partNumber, copied)
  },
}

export const fakeTranscodeProvider: TranscodeProvider = {
  producesPlayReadyPackage: true,

  async deleteOutputs() {},

  async queue({ idempotencyKey, mediaAssetId, objectKey, renditions }) {
    const renditionKey = (renditions as Rendition[])
      .map((rendition) => `${rendition.width}x${rendition.height}`)
      .join(',')
    const digest = createHash('sha256')
      .update(`${idempotencyKey}\0${mediaAssetId}\0${objectKey}\0${renditionKey}`)
      .digest('hex')
    return `provider_job_${digest.slice(0, 32)}` as ProviderJobId
  },

  async status({ now, source, startedAt }) {
    const elapsed = now.getTime() - startedAt.getTime()
    const simulatedDuration =
      source.durationSeconds >= 600
        ? source.durationSeconds * 1_400
        : Math.min(source.durationSeconds * 1_400, 7_000)
    return elapsed >= simulatedDuration ? 'ready' : 'processing'
  },
}

export const fakeDeliveryProvider: DeliveryProvider = {
  async authorize({ expiresAt, manifestFormat, mediaAssetId, playbackGrantId, token }) {
    return {
      expiresAt: expiresAt.toISOString(),
      manifestURL: `/api/demo/playback/${playbackGrantId}/${manifestFormat === 'hls' ? 'master.m3u8' : 'manifest.mpd'}?asset=${mediaAssetId}&token=${encodeURIComponent(token)}`,
    }
  },

  async revokeAsset() {},
}

export const fakeDrmProvider: DrmProvider = {
  async acquireTemporaryLicence({ browser, challenge, drmContentId, playbackGrantId }) {
    return createHash('sha256')
      .update(challenge)
      .update('\0')
      .update(drmContentId)
      .update('\0')
      .update(playbackGrantId)
      .update('\0')
      .update(browser.keySystem)
      .digest()
  },

  createPlaybackContract({ browser, playbackGrantId }) {
    if (browser.keySystem === 'com.apple.fps') {
      return {
        distinctiveIdentifier: 'not-allowed',
        fairPlayCertificateURL: `/api/demo/playback/${playbackGrantId}/fairplay-certificate`,
        hdcpRequired: false,
        keySystem: browser.keySystem,
        licenceURL: `/api/demo/playback/${playbackGrantId}/licence`,
        manifestFormat: browser.manifestFormat,
        persistentState: 'not-allowed',
        sessionType: 'temporary',
      }
    }
    return {
      distinctiveIdentifier: 'not-allowed',
      hdcpRequired: false,
      keySystem: browser.keySystem,
      licenceURL: `/api/demo/playback/${playbackGrantId}/licence`,
      manifestFormat: browser.manifestFormat,
      persistentState: 'not-allowed',
      sessionType: 'temporary',
    }
  },
}

export function resetFakeMediaStorage(): void {
  state.objects.clear()
  state.uploads.clear()
}

export function getFakeProviders(environment: NodeJS.ProcessEnv = process.env) {
  const railwayEnvironment = environment.RAILWAY_ENVIRONMENT_NAME?.toLowerCase()
  if (environment.NODE_ENV === 'production' && railwayEnvironment !== 'staging') {
    throw new Error('Deterministic fake media providers are prohibited in production.')
  }

  return {
    delivery: fakeDeliveryProvider,
    drm: fakeDrmProvider,
    storage: fakeStorageProvider,
    transcode: fakeTranscodeProvider,
  }
}
