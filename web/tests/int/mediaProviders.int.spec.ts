import { describe, expect, it } from 'vitest'

import { newMediaAssetId, newProcessingJobId, newUploadSessionId } from '@/media/identifiers'
import {
  fakeStorageProvider,
  fakeTranscodeProvider,
  getFakeProviders,
  InvalidMediaError,
} from '@/media/providers/fake'

describe('deterministic media providers', () => {
  it('keeps domain identifiers distinct and provider output deterministic', async () => {
    const mediaAssetId = newMediaAssetId()
    const uploadSessionId = newUploadSessionId()
    const processingJobId = newProcessingJobId()
    const metadata = { fileName: 'fixture.mp4', mimeType: 'video/mp4', size: 20 }
    const stored = await fakeStorageProvider.store({
      bytes: Uint8Array.from(Buffer.from('000000186674797069736f6d0000020069736f6d', 'hex')),
      metadata,
      uploadSessionId,
    })
    const providerJobId = await fakeTranscodeProvider.queue({
      mediaAssetId,
      objectKey: stored.objectKey,
    })
    const repeatedProviderJobId = await fakeTranscodeProvider.queue({
      mediaAssetId,
      objectKey: stored.objectKey,
    })

    expect(mediaAssetId).toMatch(/^asset_/)
    expect(uploadSessionId).toMatch(/^upload_/)
    expect(processingJobId).toMatch(/^processing_/)
    expect(providerJobId).toMatch(/^provider_job_/)
    expect(repeatedProviderJobId).toBe(providerJobId)
    expect(new Set([mediaAssetId, uploadSessionId, processingJobId, providerJobId]).size).toBe(4)
  })

  it('rejects a file whose bytes do not match its declared container', async () => {
    await expect(
      fakeStorageProvider.store({
        bytes: new TextEncoder().encode('not a video'),
        metadata: { fileName: 'fake.mp4', mimeType: 'video/mp4', size: 11 },
        uploadSessionId: newUploadSessionId(),
      }),
    ).rejects.toBeInstanceOf(InvalidMediaError)
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
