import { describe, expect, it } from 'vitest'

import { newMediaAssetId, newProcessingJobId, newUploadSessionId } from '@/media/identifiers'
import {
  fakeStorageProvider,
  fakeTranscodeProvider,
  getFakeProviders,
  resetFakeMediaStorage,
} from '@/media/providers/fake'
import { InvalidMediaError } from '@/media/providers/errors'
import { mkvFixture, mp4Fixture } from '../helpers/mediaFixtures'

describe('deterministic media providers', () => {
  it('reconstructs multipart uploads and probes the completed object server-side', async () => {
    resetFakeMediaStorage()
    const bytes = mp4Fixture(90, 5 * 1024 * 1024 + 1)
    const uploadSessionId = newUploadSessionId()
    const initiated = await fakeStorageProvider.initiateMultipart({
      metadata: {
        fileFingerprint: `lesson.mp4:${bytes.length}:1234`,
        fileName: 'lesson.mp4',
        mimeType: 'video/mp4',
        size: bytes.length,
      },
      uploadSessionId,
    })
    const first = await fakeStorageProvider.receivePart({
      bytes: bytes.subarray(0, initiated.partSize),
      partNumber: 1,
      providerUploadId: initiated.providerUploadId,
    })
    const second = await fakeStorageProvider.receivePart({
      bytes: bytes.subarray(initiated.partSize),
      partNumber: 2,
      providerUploadId: initiated.providerUploadId,
    })

    const stored = await fakeStorageProvider.completeMultipart({
      parts: [first, second],
      providerUploadId: initiated.providerUploadId,
    })
    await expect(fakeStorageProvider.probe(stored.objectKey)).resolves.toEqual({
      durationSeconds: 90,
      height: 1080,
      mimeType: 'video/mp4',
      size: bytes.length,
      width: 1920,
    })
  })

  it('probes MKV duration independently of client metadata', async () => {
    resetFakeMediaStorage()
    const bytes = mkvFixture(125)
    const initiated = await fakeStorageProvider.initiateMultipart({
      metadata: {
        fileFingerprint: 'lesson.mkv:18:1234',
        fileName: 'lesson.mkv',
        mimeType: 'video/x-matroska',
        size: 1,
      },
      uploadSessionId: newUploadSessionId(),
    })
    const part = await fakeStorageProvider.receivePart({
      bytes,
      partNumber: 1,
      providerUploadId: initiated.providerUploadId,
    })
    const stored = await fakeStorageProvider.completeMultipart({
      parts: [part],
      providerUploadId: initiated.providerUploadId,
    })

    await expect(fakeStorageProvider.probe(stored.objectKey)).resolves.toEqual({
      durationSeconds: 125,
      height: 1080,
      mimeType: 'video/x-matroska',
      size: bytes.length,
      width: 1920,
    })
  })

  it('keeps domain identifiers distinct and provider output deterministic', async () => {
    const mediaAssetId = newMediaAssetId()
    const uploadSessionId = newUploadSessionId()
    const processingJobId = newProcessingJobId()
    const bytes = mp4Fixture()
    const metadata = {
      fileFingerprint: 'fixture.mp4:136:1234',
      fileName: 'fixture.mp4',
      mimeType: 'video/mp4',
      size: bytes.length,
    }
    const initiated = await fakeStorageProvider.initiateMultipart({ metadata, uploadSessionId })
    const parts = []
    for (
      let offset = 0, partNumber = 1;
      offset < bytes.length;
      offset += initiated.partSize, partNumber += 1
    ) {
      parts.push(
        await fakeStorageProvider.receivePart({
          bytes: bytes.subarray(offset, offset + initiated.partSize),
          partNumber,
          providerUploadId: initiated.providerUploadId,
        }),
      )
    }
    const stored = await fakeStorageProvider.completeMultipart({
      parts,
      providerUploadId: initiated.providerUploadId,
    })
    const providerJobId = await fakeTranscodeProvider.queue({
      idempotencyKey: processingJobId,
      mediaAssetId,
      objectKey: stored.objectKey,
      outputPrefix: `outputs/${processingJobId}/`,
      renditions: [],
      source: { durationSeconds: 60, height: 1080, width: 1920 },
    })
    const repeatedProviderJobId = await fakeTranscodeProvider.queue({
      idempotencyKey: processingJobId,
      mediaAssetId,
      objectKey: stored.objectKey,
      outputPrefix: `outputs/${processingJobId}/`,
      renditions: [],
      source: { durationSeconds: 60, height: 1080, width: 1920 },
    })

    expect(mediaAssetId).toMatch(/^asset_/)
    expect(uploadSessionId).toMatch(/^upload_/)
    expect(processingJobId).toMatch(/^processing_/)
    expect(providerJobId).toMatch(/^provider_job_/)
    expect(repeatedProviderJobId).toBe(providerJobId)
    expect(new Set([mediaAssetId, uploadSessionId, processingJobId, providerJobId]).size).toBe(4)
  })

  it('rejects a file whose bytes do not match its declared container', async () => {
    await expect(fakeStorageProvider.probe('missing-object')).rejects.toBeInstanceOf(
      InvalidMediaError,
    )

    const initiated = await fakeStorageProvider.initiateMultipart({
      metadata: {
        fileFingerprint: 'fake.mp4:11:1234',
        fileName: 'fake.mp4',
        mimeType: 'video/mp4',
        size: 11,
      },
      uploadSessionId: newUploadSessionId(),
    })
    const part = await fakeStorageProvider.receivePart({
      bytes: new TextEncoder().encode('not a video'),
      partNumber: 1,
      providerUploadId: initiated.providerUploadId,
    })
    const stored = await fakeStorageProvider.completeMultipart({
      parts: [part],
      providerUploadId: initiated.providerUploadId,
    })
    await expect(fakeStorageProvider.probe(stored.objectKey)).rejects.toBeInstanceOf(
      InvalidMediaError,
    )
  })

  it('allows fakes in Railway staging but refuses them in production', () => {
    expect(() =>
      getFakeProviders({ NODE_ENV: 'production', RAILWAY_ENVIRONMENT_NAME: 'staging' }),
    ).not.toThrow()
    expect(() =>
      getFakeProviders({ NODE_ENV: 'production', RAILWAY_ENVIRONMENT_NAME: 'production' }),
    ).toThrow('prohibited in production')
  })
})
