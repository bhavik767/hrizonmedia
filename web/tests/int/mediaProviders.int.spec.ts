import { describe, expect, it } from 'vitest'

import { newMediaAssetId, newUploadSessionId } from '@/media/identifiers'
import {
  fakeStorageProvider,
  fakeTranscodeProvider,
  InvalidMediaError,
} from '@/media/providers/fake'

describe('deterministic media providers', () => {
  it('keeps the Media Asset, Upload Session, and provider job identifiers distinct', async () => {
    const mediaAssetId = newMediaAssetId()
    const uploadSessionId = newUploadSessionId()
    const stored = await fakeStorageProvider.store({
      bytes: Uint8Array.from(Buffer.from('000000186674797069736f6d0000020069736f6d', 'hex')),
      fileName: 'fixture.mp4',
      mimeType: 'video/mp4',
      uploadSessionId,
    })
    const providerJobId = await fakeTranscodeProvider.queue({
      mediaAssetId,
      objectKey: stored.objectKey,
    })

    expect(mediaAssetId).toMatch(/^asset_/)
    expect(uploadSessionId).toMatch(/^upload_/)
    expect(providerJobId).toMatch(/^job_/)
    expect(new Set([mediaAssetId, uploadSessionId, providerJobId]).size).toBe(3)
  })

  it('rejects a file whose bytes do not match its declared container', async () => {
    await expect(
      fakeStorageProvider.store({
        bytes: new TextEncoder().encode('not a video'),
        fileName: 'fake.mp4',
        mimeType: 'video/mp4',
        uploadSessionId: newUploadSessionId(),
      }),
    ).rejects.toBeInstanceOf(InvalidMediaError)
  })
})
