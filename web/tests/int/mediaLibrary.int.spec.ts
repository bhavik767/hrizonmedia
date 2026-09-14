import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  completeUpload,
  cleanupAbandonedUploads,
  createUploadSession,
  getVisibleAsset,
  listVisibleAssets,
  resumeUploadSession,
  receiveUploadPart,
} from '@/media/library'
import { resetFakeMediaStorage } from '@/media/providers/fake'
import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'
import { mkvFixture, mp4Fixture } from '../helpers/mediaFixtures'

let payload: Payload
let firstUploader: PilotMember
let secondUploader: PilotMember

const metadataFor = (bytes: Uint8Array, fileName = 'fixture.mp4') => ({
  fileFingerprint: `${fileName}:${bytes.length}:1234`,
  fileName,
  mimeType: 'video/mp4',
  size: bytes.length,
})

async function uploadAllParts(
  session: Awaited<ReturnType<typeof createUploadSession>>,
  bytes: Uint8Array,
) {
  const parts = []
  for (
    let offset = 0, partNumber = 1;
    offset < bytes.length;
    offset += session.partSize, partNumber += 1
  ) {
    parts.push(
      await receiveUploadPart(
        payload,
        firstUploader,
        session.uploadSessionId,
        partNumber,
        bytes.subarray(offset, offset + session.partSize),
      ),
    )
  }
  return parts
}

async function cleanMediaLibrary() {
  await payload.delete({ collection: 'processing-jobs', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'upload-sessions', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-assets', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
}

async function createUploader(email: string): Promise<PilotMember> {
  return payload.create({
    collection: 'pilot-members',
    data: {
      email,
      invitationAcceptedAt: new Date().toISOString(),
      name: email,
      password: 'uploader-password',
      role: 'uploader',
      status: 'active',
    },
    overrideAccess: true,
  })
}

describe('Media Asset library persistence', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    resetFakeMediaStorage()
    await cleanMediaLibrary()
    firstUploader = await createUploader('first-library-uploader@example.test')
    secondUploader = await createUploader('second-library-uploader@example.test')
  })

  afterAll(async () => {
    await cleanMediaLibrary()
  })

  it('persists distinct record IDs and filters list/detail reads by owner', async () => {
    const fixture = mp4Fixture()
    const session = await createUploadSession(payload, firstUploader, metadataFor(fixture))
    const parts = await uploadAllParts(session, fixture)
    await completeUpload(payload, firstUploader, session.uploadSessionId, parts)
    const detail = await getVisibleAsset(payload, firstUploader, session.asset.mediaAssetId)

    expect(detail.uploadSessionId).toMatch(/^upload_/)
    expect(detail.processingJobId).toMatch(/^processing_/)
    expect(detail.providerJobId).toMatch(/^provider_job_/)
    expect(
      new Set([
        detail.mediaAssetId,
        detail.uploadSessionId,
        detail.processingJobId,
        detail.providerJobId,
      ]).size,
    ).toBe(4)
    await expect(listVisibleAssets(payload, secondUploader)).resolves.toEqual([])
    await expect(
      getVisibleAsset(payload, secondUploader, session.asset.mediaAssetId),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('rejects completion after the persisted Upload Session expires', async () => {
    const fixture = mp4Fixture()
    const session = await createUploadSession(payload, firstUploader, metadataFor(fixture))
    const stored = await payload.find({
      collection: 'upload-sessions',
      limit: 1,
      overrideAccess: true,
      where: { uploadSessionId: { equals: session.uploadSessionId } },
    })
    await payload.update({
      collection: 'upload-sessions',
      data: { expiresAt: new Date(Date.now() - 1_000).toISOString() },
      id: stored.docs[0]!.id,
      overrideAccess: true,
    })

    await expect(
      resumeUploadSession(
        payload,
        firstUploader,
        session.uploadSessionId,
        metadataFor(fixture).fileFingerprint,
      ),
    ).rejects.toMatchObject({ status: 410 })
  })

  it('resumes with completed parts but rejects a mismatched file', async () => {
    const fixture = mp4Fixture()
    const session = await createUploadSession(payload, firstUploader, metadataFor(fixture))
    await receiveUploadPart(
      payload,
      firstUploader,
      session.uploadSessionId,
      1,
      fixture.subarray(0, session.partSize),
    )

    await expect(
      resumeUploadSession(
        payload,
        firstUploader,
        session.uploadSessionId,
        metadataFor(fixture).fileFingerprint,
      ),
    ).resolves.toMatchObject({ completedParts: [{ partNumber: 1 }] })
    await expect(
      resumeUploadSession(payload, firstUploader, session.uploadSessionId, 'different-file'),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('rejects corrupt and over-duration completed media after server-side probing', async () => {
    for (const fixture of [Buffer.from('not a video'), mp4Fixture(7_201)]) {
      const session = await createUploadSession(payload, firstUploader, metadataFor(fixture))
      const parts = await uploadAllParts(session, fixture)
      await expect(
        completeUpload(payload, firstUploader, session.uploadSessionId, parts),
      ).rejects.toMatchObject({ status: 400 })
    }
  })

  it('replaces advisory size metadata with the verified completed object size', async () => {
    const fixture = mp4Fixture()
    const advisory = { ...metadataFor(fixture), size: 1 }
    const session = await createUploadSession(payload, firstUploader, advisory)
    const parts = await uploadAllParts(session, fixture)
    await completeUpload(payload, firstUploader, session.uploadSessionId, parts)

    await expect(
      getVisibleAsset(payload, firstUploader, session.asset.mediaAssetId),
    ).resolves.toMatchObject({ size: fixture.length })
  })

  it('accepts an MKV when the browser omits advisory MIME metadata', async () => {
    const fixture = mkvFixture()
    const session = await createUploadSession(payload, firstUploader, {
      ...metadataFor(fixture, 'lesson.mkv'),
      mimeType: '',
    })
    const parts = await uploadAllParts(session, fixture)

    await expect(
      completeUpload(payload, firstUploader, session.uploadSessionId, parts),
    ).resolves.toMatchObject({ fileName: 'lesson.mkv', status: 'queued' })
  })

  it('rejects advisory metadata over 2 GB before starting storage', async () => {
    await expect(
      createUploadSession(payload, firstUploader, {
        fileFingerprint: 'oversized',
        fileName: 'oversized.mp4',
        mimeType: 'video/mp4',
        size: 2 * 1024 * 1024 * 1024 + 1,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('cleans expired multipart uploads idempotently', async () => {
    const fixture = mp4Fixture()
    const session = await createUploadSession(payload, firstUploader, metadataFor(fixture))
    const stored = await payload.find({
      collection: 'upload-sessions',
      limit: 1,
      overrideAccess: true,
      where: { uploadSessionId: { equals: session.uploadSessionId } },
    })
    await payload.update({
      collection: 'upload-sessions',
      data: { expiresAt: new Date(Date.now() - 1_000).toISOString() },
      id: stored.docs[0]!.id,
      overrideAccess: true,
    })

    await expect(cleanupAbandonedUploads(payload)).resolves.toBe(1)
    await expect(cleanupAbandonedUploads(payload)).resolves.toBe(0)
  })
})
