import { generateKeyPairSync } from 'node:crypto'

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'

import { newMediaAssetId, newProcessingJobId, newUploadSessionId } from '@/media/identifiers'
import { createCloudFrontDeliveryProvider } from '@/media/providers/cloudfront'
import { MultipartUploadError } from '@/media/providers/errors'
import { getMediaProviders } from '@/media/providers'
import { createS3OutputVerifier, createS3StorageProvider } from '@/media/providers/s3'

const metadata = {
  fileFingerprint: 'lesson.mp4:5242881:fingerprint',
  fileName: 'lesson.mp4',
  mimeType: 'video/mp4' as const,
  size: 5 * 1024 * 1024 + 1,
}

function commandSender(responses: unknown[]) {
  const send = vi.fn(async (_command: object): Promise<never> => responses.shift() as never)
  return { client: { send }, send }
}

describe('S3 storage provider', () => {
  it('accepts canonical outputs only when the worker completion marker matches every rendition', async () => {
    const processingJobId = newProcessingJobId()
    const outputPrefix = `outputs/${processingJobId}/`
    const renditions = [
      { audioCodec: 'aac' as const, height: 360 as const, videoCodec: 'h264' as const, width: 640 },
      { audioCodec: 'aac' as const, height: 480 as const, videoCodec: 'h264' as const, width: 854 },
    ]
    const { client, send } = commandSender([
      {
        Body: {
          transformToString: async () =>
            JSON.stringify({ attempt: 1, outputPrefix, renditions, version: 1 }),
        },
        ContentLength: 512,
      },
      {
        Body: {
          transformToString: async () =>
            '<MPD><ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/><Representation codecs="avc1.64001f" height="360"/><Representation codecs="avc1.640028" height="480"/><Representation codecs="mp4a.40.2"/></MPD>',
        },
        ContentLength: 1024,
        ContentType: 'application/dash+xml',
      },
      {
        Body: { transformToString: async () => '#EXTM3U\nvideo.m3u8\n' },
        ContentLength: 1024,
        ContentType: 'application/vnd.apple.mpegurl',
      },
      {
        Body: {
          transformToString: async () =>
            '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://asset",KEYFORMAT="com.apple.streamingkeydelivery"\n',
        },
        ContentLength: 1024,
        ContentType: 'application/vnd.apple.mpegurl',
      },
      {
        Contents: [
          { Key: `${outputPrefix}master.m3u8` },
          { Key: `${outputPrefix}video-init.mp4` },
          { Key: `${outputPrefix}video-1.m4s` },
        ],
      },
    ])
    const verify = createS3OutputVerifier(
      {
        accessKeyId: 'access',
        bucket: 'private-bucket',
        region: 'ap-south-1',
        secretAccessKey: 'secret',
      },
      { client },
    )

    await expect(verify({ attempt: 1, outputPrefix, renditions })).resolves.toBeUndefined()
    expect(send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand)
    expect((send.mock.calls[0]![0] as GetObjectCommand).input.Key).toBe(
      `${outputPrefix}completion.json`,
    )
    expect(send.mock.calls[1]![0]).toBeInstanceOf(GetObjectCommand)
    expect((send.mock.calls[1]![0] as GetObjectCommand).input.Key).toBe(
      `${outputPrefix}manifest.mpd`,
    )
    expect((send.mock.calls[2]![0] as GetObjectCommand).input.Key).toBe(
      `${outputPrefix}master.m3u8`,
    )
    expect((send.mock.calls[3]![0] as GetObjectCommand).input.Key).toBe(`${outputPrefix}video.m3u8`)
    expect(send.mock.calls[4]![0]).toBeInstanceOf(ListObjectsV2Command)
  })

  it('creates a private checksummed multipart upload and signs an exact part receipt', async () => {
    const uploadSessionId = newUploadSessionId()
    const { client, send } = commandSender([{ UploadId: 'native-upload-id' }])
    const presign = vi.fn(
      async (
        _client: unknown,
        _command: UploadPartCommand,
        _options: { expiresIn: number; unhoistableHeaders?: Set<string> },
      ) => 'https://bucket.example/upload-part',
    )
    const provider = createS3StorageProvider(
      {
        accessKeyId: 'access',
        bucket: 'private-bucket',
        region: 'ap-south-1',
        secretAccessKey: 'secret',
      },
      { client, presign, probe: vi.fn() },
    )

    const initiated = await provider.initiateMultipart({ metadata, uploadSessionId })
    expect(initiated.providerUploadId).toMatch(/^provider_upload_[0-9a-f-]{36}$/)
    expect(initiated.providerUploadId).not.toContain('native-upload-id')
    expect(initiated.providerUploadData).toBeTruthy()
    const create = send.mock.calls[0]![0] as CreateMultipartUploadCommand
    expect(create).toBeInstanceOf(CreateMultipartUploadCommand)
    expect(create.input).toMatchObject({
      Bucket: 'private-bucket',
      ChecksumAlgorithm: 'SHA256',
      ContentType: 'video/mp4',
      Key: `sources/${uploadSessionId}/source.mp4`,
    })
    expect(create.input).not.toHaveProperty('ACL')

    const checksumSHA256 = 'ab'.repeat(32)
    const target = await provider.createPartUploadTarget({
      checksumSHA256,
      partNumber: 1,
      providerUploadData: initiated.providerUploadData,
      providerUploadId: initiated.providerUploadId,
      size: 5 * 1024 * 1024,
      uploadSessionId,
    })
    const uploadPart = presign.mock.calls[0]![1] as UploadPartCommand
    expect(uploadPart).toBeInstanceOf(UploadPartCommand)
    expect(uploadPart.input).toMatchObject({
      Bucket: 'private-bucket',
      ChecksumSHA256: Buffer.from(checksumSHA256, 'hex').toString('base64'),
      ContentLength: 5 * 1024 * 1024,
      Key: `sources/${uploadSessionId}/source.mp4`,
      PartNumber: 1,
      UploadId: 'native-upload-id',
    })
    expect(target.headers).toMatchObject({
      'x-amz-checksum-sha256': Buffer.from(checksumSHA256, 'hex').toString('base64'),
    })
    expect(presign.mock.calls[0]![2]).toMatchObject({ expiresIn: 10 * 60 })
    expect(presign.mock.calls[0]![2]?.unhoistableHeaders).toEqual(
      new Set(['x-amz-checksum-sha256']),
    )
  })

  it('exhausts part pagination and rejects completion receipts that differ from storage', async () => {
    const uploadSessionId = newUploadSessionId()
    const firstChecksum = Buffer.from('11'.repeat(32), 'hex').toString('base64')
    const secondChecksum = Buffer.from('22'.repeat(32), 'hex').toString('base64')
    const { client } = commandSender([
      { UploadId: 'native-upload-id' },
      {
        IsTruncated: true,
        NextPartNumberMarker: '1',
        Parts: [{ ChecksumSHA256: firstChecksum, ETag: '"etag-1"', PartNumber: 1, Size: 5 }],
      },
      {
        IsTruncated: false,
        Parts: [{ ChecksumSHA256: secondChecksum, ETag: '"etag-2"', PartNumber: 2, Size: 1 }],
      },
      {
        IsTruncated: false,
        Parts: [
          { ChecksumSHA256: firstChecksum, ETag: '"etag-1"', PartNumber: 1, Size: 5 },
          { ChecksumSHA256: secondChecksum, ETag: '"etag-2"', PartNumber: 2, Size: 1 },
        ],
      },
    ])
    const provider = createS3StorageProvider(
      {
        accessKeyId: 'access',
        bucket: 'private-bucket',
        region: 'ap-south-1',
        secretAccessKey: 'secret',
      },
      { client, presign: vi.fn(), probe: vi.fn() },
    )
    const initiated = await provider.initiateMultipart({
      metadata: { ...metadata, size: 6 },
      uploadSessionId,
    })

    await expect(
      provider.listParts(initiated.providerUploadId, initiated.providerUploadData),
    ).resolves.toEqual([
      { checksumSHA256: '11'.repeat(32), etag: 'etag-1', partNumber: 1, size: 5 },
      { checksumSHA256: '22'.repeat(32), etag: 'etag-2', partNumber: 2, size: 1 },
    ])
    await expect(
      provider.completeMultipart({
        parts: [
          { checksumSHA256: '11'.repeat(32), etag: 'different', partNumber: 1, size: 5 },
          { checksumSHA256: '22'.repeat(32), etag: 'etag-2', partNumber: 2, size: 1 },
        ],
        providerUploadData: initiated.providerUploadData,
        providerUploadId: initiated.providerUploadId,
      }),
    ).rejects.toBeInstanceOf(MultipartUploadError)
  })

  it('completes only the verified listing and confirms the private object metadata', async () => {
    const uploadSessionId = newUploadSessionId()
    const checksum = Buffer.from('33'.repeat(32), 'hex').toString('base64')
    const { client, send } = commandSender([
      { UploadId: 'native-upload-id' },
      {
        IsTruncated: false,
        Parts: [{ ChecksumSHA256: checksum, ETag: '"etag"', PartNumber: 1, Size: metadata.size }],
      },
      {},
      { ChecksumSHA256: checksum, ContentLength: metadata.size, ContentType: 'video/mp4' },
    ])
    const provider = createS3StorageProvider(
      {
        accessKeyId: 'access',
        bucket: 'private-bucket',
        region: 'ap-south-1',
        secretAccessKey: 'secret',
      },
      { client, presign: vi.fn(), probe: vi.fn() },
    )
    const initiated = await provider.initiateMultipart({ metadata, uploadSessionId })

    await expect(
      provider.completeMultipart({
        parts: [
          { checksumSHA256: '33'.repeat(32), etag: 'etag', partNumber: 1, size: metadata.size },
        ],
        providerUploadData: initiated.providerUploadData,
        providerUploadId: initiated.providerUploadId,
      }),
    ).resolves.toEqual({ objectKey: `sources/${uploadSessionId}/source.mp4` })
    expect(send.mock.calls[2]![0]).toBeInstanceOf(CompleteMultipartUploadCommand)
    expect(send.mock.calls[3]![0]).toBeInstanceOf(HeadObjectCommand)
  })

  it('deletes every object under one validated processing output prefix', async () => {
    const processingJobId = newProcessingJobId()
    const prefix = `outputs/${processingJobId}/`
    const { client, send } = commandSender([
      {
        Contents: [{ Key: `${prefix}manifest.mpd` }],
        IsTruncated: true,
        NextContinuationToken: 'next',
      },
      {},
      { Contents: [{ Key: `${prefix}video-1.m4s` }], IsTruncated: false },
      {},
    ])
    const provider = createS3StorageProvider(
      {
        accessKeyId: 'access',
        bucket: 'private-bucket',
        region: 'ap-south-1',
        secretAccessKey: 'secret',
      },
      { client, presign: vi.fn(), probe: vi.fn() },
    )

    await provider.deletePrefix(prefix)
    expect(send.mock.calls.map(([command]) => command.constructor)).toEqual([
      ListObjectsV2Command,
      DeleteObjectsCommand,
      ListObjectsV2Command,
      DeleteObjectsCommand,
    ])
    await expect(provider.deletePrefix('outputs/not-safe/')).rejects.toBeInstanceOf(
      MultipartUploadError,
    )
  })

  it('makes abort and exact source deletion idempotent without broad object keys', async () => {
    const uploadSessionId = newUploadSessionId()
    const missing = Object.assign(new Error('gone'), { name: 'NoSuchUpload' })
    const { client, send } = commandSender([{ UploadId: 'native-upload-id' }, missing, {}])
    send.mockImplementationOnce(async () => ({ UploadId: 'native-upload-id' }) as never)
    send.mockImplementationOnce(async () => Promise.reject(missing))
    send.mockImplementationOnce(async () => ({}) as never)
    const provider = createS3StorageProvider(
      {
        accessKeyId: 'access',
        bucket: 'private-bucket',
        region: 'ap-south-1',
        secretAccessKey: 'secret',
      },
      { client, presign: vi.fn(), probe: vi.fn() },
    )
    const initiated = await provider.initiateMultipart({ metadata, uploadSessionId })

    await expect(
      provider.abortMultipart(initiated.providerUploadId, initiated.providerUploadData),
    ).resolves.toBeUndefined()
    await expect(
      provider.deleteObject(`sources/${uploadSessionId}/source.mp4`),
    ).resolves.toBeUndefined()
    expect(send.mock.calls[1]![0]).toBeInstanceOf(AbortMultipartUploadCommand)
    expect(send.mock.calls[2]![0]).toBeInstanceOf(DeleteObjectCommand)
    await expect(provider.deleteObject('outputs/everything')).rejects.toBeInstanceOf(
      MultipartUploadError,
    )
  })
})

describe('CloudFront delivery provider', () => {
  it('creates a 60-second signed URL scoped to one processing output prefix', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const now = new Date('2026-09-16T12:00:00.000Z')
    const processingJobId = newProcessingJobId()
    const provider = createCloudFrontDeliveryProvider(
      {
        domain: 'dbjfbyqkep4un.cloudfront.net',
        keyPairId: 'K123',
        privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      },
      { now: () => now },
    )

    const authorization = await provider.authorize({
      expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      mediaAssetId: newMediaAssetId(),
      manifestFormat: 'dash',
      playbackGrantId: 'playback_00000000-0000-0000-0000-000000000000',
      processingJobId,
      manifestFormat: 'dash',
      token: 'delivery-token' as never,
    })
    const signedURL = new URL(authorization.manifestURL)
    expect(`${signedURL.origin}${signedURL.pathname}`).toBe(
      `https://dbjfbyqkep4un.cloudfront.net/${processingJobId}/manifest.mpd`,
    )
    expect(signedURL.searchParams.get('Key-Pair-Id')).toBe('K123')
    const encodedPolicy = signedURL.searchParams.get('Policy')!
    const policy = JSON.parse(
      Buffer.from(
        encodedPolicy.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/'),
        'base64',
      ).toString('utf8'),
    )
    expect(policy.Statement[0]).toMatchObject({
      Condition: { DateLessThan: { 'AWS:EpochTime': 1_789_560_060 } },
      Resource: `https://dbjfbyqkep4un.cloudfront.net/${processingJobId}/*`,
    })
    expect(signedURL.searchParams.has('Signature')).toBe(true)
    expect(authorization.expiresAt).toBe('2026-09-16T12:01:00.000Z')
    expect(authorization.resourceAuthorization).toEqual({
      origin: 'https://dbjfbyqkep4un.cloudfront.net',
      pathPrefix: `/${processingJobId}/`,
      query: signedURL.search,
    })
  })
})

describe('media provider selection', () => {
  it('refuses a partial real-provider configuration instead of silently falling back to fakes', () => {
    expect(() =>
      getMediaProviders({ NODE_ENV: 'test', VIDEO_S3_BUCKET: 'private-bucket' }),
    ).toThrow('partially configured')
  })
})
