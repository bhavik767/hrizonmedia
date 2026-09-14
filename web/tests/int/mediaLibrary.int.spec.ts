import { File as NodeFile } from 'node:buffer'

import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  completeUpload,
  createUploadSession,
  getOwnedAsset,
  listOwnedAssets,
} from '@/media/library'
import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'

let payload: Payload
let firstUploader: PilotMember
let secondUploader: PilotMember

const validFixture = () =>
  new NodeFile([Buffer.from('000000186674797069736f6d0000020069736f6d', 'hex')], 'fixture.mp4', {
    type: 'video/mp4',
  })

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
    await cleanMediaLibrary()
    firstUploader = await createUploader('first-library-uploader@example.test')
    secondUploader = await createUploader('second-library-uploader@example.test')
  })

  afterAll(async () => {
    await cleanMediaLibrary()
  })

  it('persists distinct record IDs and filters list/detail reads by owner', async () => {
    const fixture = validFixture()
    const session = await createUploadSession(payload, firstUploader, {
      fileName: fixture.name,
      mimeType: fixture.type,
      size: fixture.size,
    })
    await completeUpload(payload, firstUploader, session.uploadSessionId, fixture)
    const detail = await getOwnedAsset(payload, firstUploader, session.asset.mediaAssetId)

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
    await expect(listOwnedAssets(payload, secondUploader)).resolves.toEqual([])
    await expect(
      getOwnedAsset(payload, secondUploader, session.asset.mediaAssetId),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('rejects completion after the persisted Upload Session expires', async () => {
    const fixture = validFixture()
    const session = await createUploadSession(payload, firstUploader, {
      fileName: fixture.name,
      mimeType: fixture.type,
      size: fixture.size,
    })
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
      completeUpload(payload, firstUploader, session.uploadSessionId, fixture),
    ).rejects.toMatchObject({ status: 410 })
  })
})
