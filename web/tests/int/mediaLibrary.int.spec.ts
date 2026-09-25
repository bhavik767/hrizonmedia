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
  renewUploadPart,
} from '@/media/library'
import {
  getFakeProviders,
  resetFakeMediaStorage,
} from '@/media/providers/fake'
import { MultipartUploadError } from '@/media/providers/errors'
import { runProcessingCycle } from '@/media/processing'
import config from '@/payload.config'
import type { Member } from '@/payload-types'
import { getOperationalOverview, updateOperationalControls } from '@/organisations/operations'
import {
  cleanTestOrganisations,
  createTestOrganisation,
  createTestPlatformAdministrator,
} from '../helpers/organisations'
import { mkvFixture, mp4Fixture } from '../helpers/mediaFixtures'

let payload: Payload
let firstUploader: Member
let secondUploader: Member
let firstOrganisationID: number

const metadataFor = (bytes: Uint8Array, fileName = 'fixture.mp4') => ({
  fileFingerprint: `${fileName}:${bytes.length}:1234`,
  fileName,
  mimeType: 'video/mp4',
  organisationID: firstOrganisationID,
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
  await payload.delete({ collection: 'audit-events', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-operations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'processing-jobs', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'upload-sessions', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-assets', overrideAccess: true, where: {} })
  await cleanTestOrganisations(payload)
  await payload.delete({ collection: 'members', overrideAccess: true, where: {} })
}

async function createUploader(email: string): Promise<Member> {
  return payload.create({
    collection: 'members',
    data: {
      email,
      name: email,
      password: 'uploader-password',
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
    firstOrganisationID = await createTestOrganisation(payload, firstUploader)
    await createTestOrganisation(payload, secondUploader)
  })

  afterAll(async () => {
    await cleanMediaLibrary()
  })

  it('persists distinct record IDs and filters list/detail reads by Organisation membership', async () => {
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
    ).rejects.toMatchObject({ status: 403 })
  })

  it('persists provider-native multipart state separately from the opaque provider ID', async () => {
    const fixture = mp4Fixture()
    const providers = getFakeProviders()
    const initiateMultipart = providers.storage.initiateMultipart
    providers.storage = {
      ...providers.storage,
      async initiateMultipart(input) {
        return {
          ...(await initiateMultipart(input)),
          providerUploadData: 'persisted-native-provider-state',
        }
      },
    }

    const session = await createUploadSession(
      payload,
      firstUploader,
      metadataFor(fixture),
      providers,
    )
    const stored = await payload.find({
      collection: 'upload-sessions',
      limit: 1,
      overrideAccess: true,
      where: { uploadSessionId: { equals: session.uploadSessionId } },
    })

    expect(stored.docs[0]).toMatchObject({
      providerUploadData: 'persisted-native-provider-state',
      providerUploadId: expect.stringMatching(/^provider_upload_/),
    })
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

  it('blocks resumed upload activity after an operator enables the kill switch', async () => {
    const fixture = mp4Fixture()
    const session = await createUploadSession(payload, firstUploader, metadataFor(fixture))
    const operator = await payload.create({
      collection: 'members',
      data: {
        email: 'upload-kill-switch-operator@example.test',
        name: 'Upload kill switch operator',
        password: 'operator-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    await createTestPlatformAdministrator(payload, operator)
    await updateOperationalControls(payload, operator, {
      killSwitchEnabled: true,
      providerConcurrency: 2,
    })

    for (const activity of [
      () =>
        resumeUploadSession(
          payload,
          firstUploader,
          session.uploadSessionId,
          metadataFor(fixture).fileFingerprint,
        ),
      () => renewUploadPart(payload, firstUploader, session.uploadSessionId, 1),
      () => receiveUploadPart(payload, firstUploader, session.uploadSessionId, 1, fixture),
      () => completeUpload(payload, firstUploader, session.uploadSessionId, []),
    ]) {
      await expect(activity()).rejects.toMatchObject({ status: 503 })
    }
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
        organisationID: firstOrganisationID,
        size: 2 * 1024 * 1024 * 1024 + 1,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects file names containing path traversal or path separators', async () => {
    const fixture = mp4Fixture()

    for (const fileName of ['../private.mp4', '..\\private.mp4', 'folder/private.mp4']) {
      await expect(
        createUploadSession(payload, firstUploader, metadataFor(fixture, fileName)),
      ).rejects.toMatchObject({ status: 400 })
    }
  })

  it('sanitizes credential-bearing storage validation failures', async () => {
    const fixture = mp4Fixture()
    const session = await createUploadSession(payload, firstUploader, metadataFor(fixture))
    const providers = getFakeProviders()
    providers.storage = {
      ...providers.storage,
      completeMultipart: async () => {
        throw new MultipartUploadError('credential=never-expose')
      },
    }
    await expect(
      completeUpload(payload, firstUploader, session.uploadSessionId, [], providers),
    ).rejects.toMatchObject({ message: 'Uploaded parts could not be validated.', status: 400 })
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

  it('records upload and processing transitions for operator investigation', async () => {
    const fixture = mp4Fixture()
    const startedAt = new Date('2026-09-15T09:00:00.000Z')
    const session = await createUploadSession(payload, firstUploader, metadataFor(fixture))
    const parts = await uploadAllParts(session, fixture)
    await completeUpload(payload, firstUploader, session.uploadSessionId, parts, undefined, {
      now: startedAt,
    })
    await runProcessingCycle(payload, { now: new Date(startedAt.getTime() + 10_000) })
    const operator = await payload.create({
      collection: 'members',
      data: {
        email: 'audit-viewer@example.test',
        name: 'Audit viewer',
        password: 'operator-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    await createTestPlatformAdministrator(payload, operator)

    const actions = (await getOperationalOverview(payload, operator)).auditEvents.map(
      ({ action }) => action,
    )
    expect(actions).toEqual(
      expect.arrayContaining([
        'upload_started',
        'upload_completed',
        'processing_queued',
        'processing_dispatched',
        'processing_ready',
      ]),
    )
  })
})
