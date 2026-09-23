import 'server-only'

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import type { CompletedPart } from '../multipart'
import type { MediaProbe, Rendition, StorageProvider } from './contracts'
import { probeS3Object } from './ffprobe'
import { InvalidMediaError, MultipartUploadError } from './errors'
import {
  newS3UploadState,
  readS3UploadState,
  type S3UploadDescriptor,
  validateOutputPrefix,
  validateSourceKey,
} from './s3-upload-state'

const PART_SIZE = 5 * 1024 * 1024
const MAX_PARTS = 10_000

export interface S3Configuration {
  accessKeyId: string
  bucket: string
  region: string
  secretAccessKey: string
}

interface CommandClient {
  send(command: object): Promise<S3CommandResult>
}

interface S3CommandResult {
  Body?: {
    pipe?: (destination: NodeJS.WritableStream) => unknown
    transformToString?: () => Promise<string>
  }
  ChecksumSHA256?: string
  ContentLength?: number
  ContentType?: string
  Contents?: Array<{ Key?: string }>
  Errors?: unknown[]
  IsTruncated?: boolean
  NextContinuationToken?: string
  NextPartNumberMarker?: string
  Parts?: Array<{
    ChecksumSHA256?: string
    ETag?: string
    PartNumber?: number
    Size?: number
  }>
  UploadId?: string
}

interface S3Dependencies {
  client?: CommandClient
  presign?: (
    client: CommandClient,
    command: UploadPartCommand,
    options: { expiresIn: number; unhoistableHeaders?: Set<string> },
  ) => Promise<string>
  probe?: (client: CommandClient, bucket: string, key: string) => Promise<MediaProbe>
}

function createS3Client(configuration: S3Configuration): CommandClient {
  return new S3Client({
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
    region: configuration.region,
  }) as unknown as CommandClient
}

export function createS3OutputVerifier(
  configuration: S3Configuration,
  dependencies: Pick<S3Dependencies, 'client'> = {},
) {
  const client = dependencies.client ?? createS3Client(configuration)

  return async (input: {
    attempt: number
    outputPrefix: string
    renditions: Rendition[]
  }): Promise<void> => {
    validateOutputPrefix(input.outputPrefix)
    const completion = await client.send(
      new GetObjectCommand({
        Bucket: configuration.bucket,
        Key: `${input.outputPrefix}completion.json`,
      }),
    )
    if (
      !completion.Body?.transformToString ||
      !completion.ContentLength ||
      completion.ContentLength > 16 * 1024
    ) {
      throw new Error('Transcoder completion marker is invalid.')
    }
    let marker: unknown
    try {
      marker = JSON.parse(await completion.Body.transformToString())
    } catch (error) {
      throw new Error('Transcoder completion marker is invalid.', { cause: error })
    }
    if (
      typeof marker !== 'object' ||
      marker === null ||
      (marker as { version?: unknown }).version !== 1 ||
      (marker as { attempt?: unknown }).attempt !== input.attempt ||
      (marker as { outputPrefix?: unknown }).outputPrefix !== input.outputPrefix ||
      JSON.stringify((marker as { renditions?: unknown }).renditions) !==
        JSON.stringify(input.renditions)
    ) {
      throw new Error('Transcoder completion marker does not match the Processing Job.')
    }
    const manifest = await client.send(
      new GetObjectCommand({
        Bucket: configuration.bucket,
        Key: `${input.outputPrefix}manifest.mpd`,
      }),
    )
    if (
      manifest.ContentType !== 'application/dash+xml' ||
      !manifest.ContentLength ||
      manifest.ContentLength > 1024 * 1024 ||
      !manifest.Body?.transformToString
    ) {
      throw new Error('Transcoder manifest is missing or invalid.')
    }
    const manifestText = await manifest.Body.transformToString()
    if (
      !/codecs=["'][^"']*avc1/i.test(manifestText) ||
      !/codecs=["'][^"']*mp4a/i.test(manifestText) ||
      !/edef8ba9-79d6-4ace-a3c8-27dcd51d21ed/i.test(manifestText) ||
      !/9a04f079-9840-4286-ab92-e65be0885f95/i.test(manifestText) ||
      input.renditions.some(
        ({ height }) => !new RegExp(`height=["']${height}["']`).test(manifestText),
      )
    ) {
      throw new Error('Transcoder manifest does not contain the approved encrypted ladder.')
    }
    const hlsManifest = await client.send(
      new GetObjectCommand({
        Bucket: configuration.bucket,
        Key: `${input.outputPrefix}master.m3u8`,
      }),
    )
    if (
      hlsManifest.ContentType !== 'application/vnd.apple.mpegurl' ||
      !hlsManifest.ContentLength ||
      hlsManifest.ContentLength > 1024 * 1024 ||
      !hlsManifest.Body?.transformToString
    ) {
      throw new Error('Transcoder HLS manifest is missing or invalid.')
    }
    const hlsManifestText = await hlsManifest.Body.transformToString()
    const hlsPlaylistNames = hlsManifestText
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('#') && /^[A-Za-z0-9._-]+\.m3u8$/.test(line))
    if (!/^#EXTM3U/m.test(hlsManifestText) || hlsPlaylistNames.length === 0) {
      throw new Error('Transcoder HLS manifest does not contain an encrypted playlist.')
    }
    const hlsPlaylists = await Promise.all(
      hlsPlaylistNames.map((name) =>
        client.send(
          new GetObjectCommand({
            Bucket: configuration.bucket,
            Key: `${input.outputPrefix}${name}`,
          }),
        ),
      ),
    )
    const hlsPlaylistTexts = await Promise.all(
      hlsPlaylists.map(async (playlist) => {
        if (
          playlist.ContentType !== 'application/vnd.apple.mpegurl' ||
          !playlist.ContentLength ||
          playlist.ContentLength > 1024 * 1024 ||
          !playlist.Body?.transformToString
        ) {
          throw new Error('Transcoder HLS playlist is missing or invalid.')
        }
        return playlist.Body.transformToString()
      }),
    )
    if (
      !hlsPlaylistTexts.some(
        (playlist) =>
          /#EXT-X-KEY:METHOD=SAMPLE-AES,/i.test(playlist) &&
          /KEYFORMAT="com\.apple\.streamingkeydelivery"/i.test(playlist),
      )
    ) {
      throw new Error('Transcoder HLS playlist is not FairPlay encrypted.')
    }
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: configuration.bucket, Prefix: input.outputPrefix }),
    )
    const keys = (listed.Contents ?? []).flatMap(({ Key }) => (Key ? [Key] : []))
    if (
      !keys.some((key) => key.endsWith('.mp4')) ||
      !keys.some((key) => key.endsWith('.m4s')) ||
      !keys.some((key) => key.endsWith('.m3u8')) ||
      keys.some((key) => !key.startsWith(input.outputPrefix))
    ) {
      throw new Error('Transcoder segments are missing or outside the canonical output prefix.')
    }
  }
}

export function createS3TranscodeTombstone(
  configuration: S3Configuration,
  dependencies: Pick<S3Dependencies, 'client'> = {},
) {
  const client = dependencies.client ?? createS3Client(configuration)
  return async (processingJobId: string): Promise<void> => {
    if (!/^processing_[0-9a-f-]{36}$/.test(processingJobId)) {
      throw new Error('Processing Job ID is invalid.')
    }
    await client.send(
      new PutObjectCommand({
        Body: '{}',
        Bucket: configuration.bucket,
        ContentType: 'application/json',
        Key: `transcode-tombstones/${processingJobId}`,
      }),
    )
  }
}

function normalizeETag(value: string | undefined): string {
  return value?.replace(/^"|"$/g, '') ?? ''
}

function checksumHex(value: string | undefined): string {
  if (!value) throw new MultipartUploadError('Storage omitted a part checksum.')
  const bytes = Buffer.from(value, 'base64')
  if (bytes.byteLength !== 32 || bytes.toString('base64') !== value) {
    throw new MultipartUploadError('Storage returned an invalid part checksum.')
  }
  return bytes.toString('hex')
}

function isMissingUpload(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { $metadata?: { httpStatusCode?: number }; name?: string }
  return candidate.name === 'NoSuchUpload' || candidate.$metadata?.httpStatusCode === 404
}

function sourceExtension(mimeType: S3UploadDescriptor['mimeType']): 'mkv' | 'mp4' {
  return mimeType === 'video/mp4' ? 'mp4' : 'mkv'
}

export function createS3StorageProvider(
  configuration: S3Configuration,
  dependencies: S3Dependencies = {},
): StorageProvider {
  const client = dependencies.client ?? createS3Client(configuration)
  const presign =
    dependencies.presign ??
    ((signingClient: CommandClient, command: UploadPartCommand, options: { expiresIn: number }) =>
      getSignedUrl(signingClient as unknown as S3Client, command, options))
  const probe = dependencies.probe ?? probeS3Object

  async function listedParts(descriptor: S3UploadDescriptor): Promise<CompletedPart[]> {
    const parts: CompletedPart[] = []
    let marker: string | undefined
    do {
      const result = await client.send(
        new ListPartsCommand({
          Bucket: configuration.bucket,
          Key: descriptor.key,
          PartNumberMarker: marker,
          UploadId: descriptor.nativeUploadId,
        }),
      )
      for (const part of result.Parts ?? []) {
        if (!part.PartNumber || !part.Size || !part.ETag) {
          throw new MultipartUploadError('Storage returned an incomplete part receipt.')
        }
        parts.push({
          checksumSHA256: checksumHex(part.ChecksumSHA256),
          etag: normalizeETag(part.ETag),
          partNumber: part.PartNumber,
          size: part.Size,
        })
      }
      if (parts.length > MAX_PARTS) {
        throw new MultipartUploadError('Storage returned too many upload parts.')
      }
      marker = result.IsTruncated ? result.NextPartNumberMarker : undefined
      if (result.IsTruncated && !marker) {
        throw new MultipartUploadError('Storage part pagination could not continue.')
      }
    } while (marker)
    return parts.sort((left, right) => left.partNumber - right.partNumber)
  }

  return {
    async abortMultipart(providerUploadId, providerUploadData) {
      const descriptor = readS3UploadState(providerUploadId, providerUploadData)
      try {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: configuration.bucket,
            Key: descriptor.key,
            UploadId: descriptor.nativeUploadId,
          }),
        )
      } catch (error) {
        if (!isMissingUpload(error)) throw error
      }
    },

    async completeMultipart({ parts, providerUploadData, providerUploadId }) {
      const descriptor = readS3UploadState(providerUploadId, providerUploadData)
      const orderedParts = [...parts].sort((left, right) => left.partNumber - right.partNumber)
      let stored: CompletedPart[]
      try {
        stored = await listedParts(descriptor)
      } catch (error) {
        if (!isMissingUpload(error)) throw error
        const head = await client.send(
          new HeadObjectCommand({
            Bucket: configuration.bucket,
            ChecksumMode: 'ENABLED',
            Key: descriptor.key,
          }),
        )
        if (head.ContentLength === descriptor.size && head.ContentType === descriptor.mimeType) {
          return { objectKey: descriptor.key }
        }
        throw new MultipartUploadError('Multipart upload is no longer available.')
      }
      if (
        stored.length === 0 ||
        stored.length !== orderedParts.length ||
        stored.reduce((total, part) => total + part.size, 0) !== descriptor.size ||
        stored.some(
          (part, index) =>
            part.partNumber !== index + 1 ||
            part.partNumber !== orderedParts[index]?.partNumber ||
            part.size !== orderedParts[index]?.size ||
            part.etag !== normalizeETag(orderedParts[index]?.etag) ||
            part.checksumSHA256 !== orderedParts[index]?.checksumSHA256,
        )
      ) {
        throw new MultipartUploadError('Uploaded parts do not match private storage.')
      }
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: configuration.bucket,
          Key: descriptor.key,
          MultipartUpload: {
            Parts: stored.map((part) => ({
              ChecksumSHA256: Buffer.from(part.checksumSHA256, 'hex').toString('base64'),
              ETag: `"${part.etag}"`,
              PartNumber: part.partNumber,
            })),
          },
          UploadId: descriptor.nativeUploadId,
        }),
      )
      const head = await client.send(
        new HeadObjectCommand({
          Bucket: configuration.bucket,
          ChecksumMode: 'ENABLED',
          Key: descriptor.key,
        }),
      )
      if (
        head.ContentLength !== descriptor.size ||
        head.ContentType !== descriptor.mimeType ||
        !head.ChecksumSHA256
      ) {
        throw new MultipartUploadError('Completed object verification failed.')
      }
      return { objectKey: descriptor.key }
    },

    async createPartUploadTarget(input) {
      const descriptor = readS3UploadState(input.providerUploadId, input.providerUploadData)
      if (descriptor.uploadSessionId !== input.uploadSessionId) {
        throw new MultipartUploadError('Multipart upload does not belong to this session.')
      }
      const totalParts = Math.ceil(descriptor.size / PART_SIZE)
      const expectedSize =
        input.partNumber === totalParts ? descriptor.size - PART_SIZE * (totalParts - 1) : PART_SIZE
      if (
        !input.checksumSHA256 ||
        !/^[0-9a-f]{64}$/.test(input.checksumSHA256) ||
        input.size !== expectedSize ||
        totalParts > MAX_PARTS ||
        input.partNumber < 1 ||
        input.partNumber > totalParts
      ) {
        throw new MultipartUploadError('Upload part metadata is invalid.')
      }
      const checksum = Buffer.from(input.checksumSHA256, 'hex').toString('base64')
      const command = new UploadPartCommand({
        Bucket: configuration.bucket,
        ChecksumSHA256: checksum,
        ContentLength: input.size,
        Key: descriptor.key,
        PartNumber: input.partNumber,
        UploadId: descriptor.nativeUploadId,
      })
      return {
        // Keep the checksum as a signed header. S3 requires the part-level
        // checksum header when the multipart upload uses SHA-256 checksums.
        headers: { 'x-amz-checksum-sha256': checksum },
        uploadURL: await presign(client, command, {
          expiresIn: 10 * 60,
          unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
        }),
      }
    },

    async deleteObject(objectKey) {
      validateSourceKey(objectKey)
      await client.send(new DeleteObjectCommand({ Bucket: configuration.bucket, Key: objectKey }))
    },

    async deletePrefix(prefix) {
      validateOutputPrefix(prefix)
      let continuationToken: string | undefined
      do {
        const listed = await client.send(
          new ListObjectsV2Command({
            Bucket: configuration.bucket,
            ContinuationToken: continuationToken,
            Prefix: prefix,
          }),
        )
        const objects = (listed.Contents ?? [])
          .map(({ Key }: { Key?: string }) => Key)
          .filter((key: string | undefined): key is string => Boolean(key?.startsWith(prefix)))
          .map((Key: string) => ({ Key }))
        if (objects.length) {
          const deleted = await client.send(
            new DeleteObjectsCommand({
              Bucket: configuration.bucket,
              Delete: { Objects: objects, Quiet: true },
            }),
          )
          if (deleted.Errors?.length)
            throw new Error('One or more provider objects were not deleted.')
        }
        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
        if (listed.IsTruncated && !continuationToken) {
          throw new Error('Storage object pagination could not continue.')
        }
      } while (continuationToken)
    },

    async initiateMultipart({ metadata, uploadSessionId }) {
      if (metadata.mimeType !== 'video/mp4' && metadata.mimeType !== 'video/x-matroska') {
        throw new MultipartUploadError('Source media type is invalid.')
      }
      const mimeType = metadata.mimeType
      const key = `sources/${uploadSessionId}/source.${sourceExtension(mimeType)}`
      const result = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: configuration.bucket,
          ChecksumAlgorithm: 'SHA256',
          ContentType: mimeType,
          Key: key,
          ServerSideEncryption: 'AES256',
        }),
      )
      if (!result.UploadId) throw new MultipartUploadError('Storage did not create an upload.')
      const uploadState = newS3UploadState({
        key,
        mimeType,
        nativeUploadId: result.UploadId,
        size: metadata.size,
        uploadSessionId,
      })
      return {
        partSize: PART_SIZE,
        ...uploadState,
      }
    },

    async listParts(providerUploadId, providerUploadData) {
      try {
        return await listedParts(readS3UploadState(providerUploadId, providerUploadData))
      } catch (error) {
        if (isMissingUpload(error)) throw new MultipartUploadError('Multipart upload not found.')
        throw error
      }
    },

    async probe(objectKey) {
      try {
        validateSourceKey(objectKey)
      } catch {
        throw new InvalidMediaError('Source object key is invalid.')
      }
      return probe(client, configuration.bucket, objectKey)
    },
  }
}
