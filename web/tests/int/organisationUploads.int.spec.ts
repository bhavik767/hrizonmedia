import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createUploadSession, MediaLibraryError, resumeUploadSession } from '@/media/library'
import config from '@/payload.config'
import type { Member } from '@/payload-types'

let payload: Payload
let firstPublisher: Member
let secondPublisher: Member
let firstOrganisationID: number
let secondOrganisationID: number

async function cleanOrganisationUploads() {
  await payload.delete({ collection: 'audit-events', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-access', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'playback-grants', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'upload-sessions', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'processing-jobs', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-assets', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-settings', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({
    collection: 'members',
    overrideAccess: true,
    where: { email: { contains: '@organisation-uploads.test' } },
  })
}

async function createPublisher(email: string): Promise<Member> {
  return payload.create({
    collection: 'members',
    data: {
      email,
      name: email,
      password: 'organisation-upload-password',
      status: 'active',
    },
    overrideAccess: true,
  })
}

async function createOrganisationFor(
  publisher: Member,
  name: string,
  input: {
    drmDefault?: 'protected' | 'standard'
    drmRequired?: boolean
    maximumUploadSizeBytes?: number
  } = {},
): Promise<number> {
  const organisation = await payload.create({
    collection: 'organisations',
    data: { initialAdministrator: publisher.id, name, status: 'active' },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'organisation-memberships',
    data: {
      member: publisher.id,
      organisation: organisation.id,
      role: 'publisher',
      status: 'active',
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'organisation-settings',
    data: {
      defaultRetentionDays: 30,
      drmDefault: input.drmDefault ?? 'standard',
      drmRequired: input.drmRequired ?? false,
      maximumUploadSizeBytes: input.maximumUploadSizeBytes ?? 1024 * 1024 * 1024,
      organisation: organisation.id,
      setupCompletedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  return organisation.id
}

function uploadInput(organisationID: number) {
  return {
    fileFingerprint: `fixture-${crypto.randomUUID()}`,
    fileName: 'organisation-lesson.mp4',
    mediaProtectionPolicy: 'standard' as const,
    mimeType: 'video/mp4',
    organisationID,
    retentionDays: 7,
    size: 128,
  }
}

describe('Organisation Upload Sessions', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    await cleanOrganisationUploads()
    firstPublisher = await createPublisher('first@organisation-uploads.test')
    secondPublisher = await createPublisher('second@organisation-uploads.test')
    firstOrganisationID = await createOrganisationFor(firstPublisher, 'First Organisation')
    secondOrganisationID = await createOrganisationFor(secondPublisher, 'Second Organisation', {
      drmRequired: true,
    })
  })

  afterAll(cleanOrganisationUploads)

  it('snapshots an Organisation policy and permits its Publisher to resume only that Organisation session', async () => {
    const request = uploadInput(firstOrganisationID)
    const session = await createUploadSession(payload, firstPublisher, request)
    const storedSession = await payload.find({
      collection: 'upload-sessions',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { uploadSessionId: { equals: session.uploadSessionId } },
    })
    const asset = await payload.findByID({
      collection: 'media-assets',
      depth: 0,
      id: storedSession.docs[0]!.asset as number,
      overrideAccess: true,
    })

    expect(storedSession.docs[0]).toMatchObject({
      mediaProtectionPolicy: 'standard',
      organisation: firstOrganisationID,
      retentionDays: 7,
    })
    expect(asset).toMatchObject({
      mediaProtectionPolicy: 'standard',
      organisation: firstOrganisationID,
    })
    expect(new Date(asset.expiresAt!).getTime()).toBeGreaterThan(
      Date.now() + 6 * 24 * 60 * 60 * 1000,
    )

    await expect(
      resumeUploadSession(
        payload,
        firstPublisher,
        session.uploadSessionId,
        request.fileFingerprint,
      ),
    ).resolves.toMatchObject({ uploadSessionId: session.uploadSessionId })
  })

  it('enforces Organisation DRM and size limits before a multipart upload begins', async () => {
    const forced = await createUploadSession(
      payload,
      secondPublisher,
      uploadInput(secondOrganisationID),
    )
    const stored = await payload.find({
      collection: 'upload-sessions',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { uploadSessionId: { equals: forced.uploadSessionId } },
    })
    expect(stored.docs[0]).toMatchObject({ mediaProtectionPolicy: 'protected' })

    await expect(
      createUploadSession(payload, firstPublisher, {
        ...uploadInput(firstOrganisationID),
        size: 1024 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(MediaLibraryError)
  })

  it("denies a Publisher from resuming another Organisation's Upload Session", async () => {
    const session = await createUploadSession(
      payload,
      firstPublisher,
      uploadInput(firstOrganisationID),
    )
    await expect(
      resumeUploadSession(payload, secondPublisher, session.uploadSessionId, 'anything'),
    ).rejects.toMatchObject({ status: 403 })
  })
})
