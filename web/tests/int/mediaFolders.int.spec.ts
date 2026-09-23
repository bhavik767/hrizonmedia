import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  createMediaFolder,
  createUploadSession,
  deleteMediaFolder,
  listMediaFolders,
  listVisibleAssets,
  moveMediaAssetToFolder,
  renameMediaFolder,
} from '@/media/library'
import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'

let payload: Payload
let administrator: PilotMember
let publisher: PilotMember
let otherPublisher: PilotMember
let organisationID: number

async function clean() {
  for (const collection of [
    'audit-events',
    'upload-sessions',
    'media-assets',
    'media-folders',
    'organisation-settings',
    'organisation-memberships',
    'organisations',
  ] as const) {
    await payload.delete({ collection, overrideAccess: true, where: {} })
  }
  await payload.delete({
    collection: 'pilot-members',
    overrideAccess: true,
    where: { email: { contains: '@media-folders.test' } },
  })
}

async function member(email: string): Promise<PilotMember> {
  return payload.create({
    collection: 'pilot-members',
    data: {
      email,
      invitationAcceptedAt: new Date().toISOString(),
      name: email,
      password: 'folder-password',
      role: 'uploader',
      status: 'active',
    },
    overrideAccess: true,
  })
}

async function upload(owner: PilotMember, folderID?: number) {
  return createUploadSession(payload, owner, {
    fileFingerprint: crypto.randomUUID(),
    fileName: 'lesson.mp4',
    folderID,
    mediaProtectionPolicy: 'standard',
    mimeType: 'video/mp4',
    organisationID,
    retentionDays: 7,
    size: 128,
  })
}

describe('Media Library Folders', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })
  beforeEach(async () => {
    await clean()
    administrator = await member('administrator@media-folders.test')
    publisher = await member('publisher@media-folders.test')
    otherPublisher = await member('other@media-folders.test')
    const organisation = await payload.create({
      collection: 'organisations',
      data: {
        initialAdministrator: administrator.id,
        name: 'Folder Organisation',
        status: 'active',
      },
      overrideAccess: true,
    })
    organisationID = organisation.id
    for (const [memberID, role] of [
      [administrator.id, 'administrator'],
      [publisher.id, 'publisher'],
      [otherPublisher.id, 'publisher'],
    ] as const) {
      await payload.create({
        collection: 'organisation-memberships',
        data: { member: memberID, organisation: organisationID, role, status: 'active' },
        overrideAccess: true,
      })
    }
    await payload.create({
      collection: 'organisation-settings',
      data: {
        defaultRetentionDays: 30,
        drmDefault: 'standard',
        drmRequired: false,
        maximumUploadSizeBytes: 1024 * 1024,
        organisation: organisationID,
        setupCompletedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
  })
  afterAll(clean)

  it('lets Publishers file their own uploads in an Administrator Folder and blocks deletion containing another Publisher asset', async () => {
    const folder = await createMediaFolder(payload, administrator, organisationID, 'Course videos')
    const publisherUpload = await upload(publisher, folder.id)
    await moveMediaAssetToFolder(payload, publisher, publisherUpload.asset.mediaAssetId, null)
    await moveMediaAssetToFolder(payload, publisher, publisherUpload.asset.mediaAssetId, folder.id)
    await upload(otherPublisher, folder.id)

    await expect(deleteMediaFolder(payload, publisher, folder.id)).rejects.toMatchObject({
      status: 403,
    })
    await expect(renameMediaFolder(payload, publisher, folder.id, 'Renamed')).rejects.toMatchObject(
      { status: 403 },
    )
    await expect(listMediaFolders(payload, publisher, organisationID)).resolves.toEqual([folder])
  })

  it('unfiles Media Assets when an Administrator deletes a Folder', async () => {
    const folder = await createMediaFolder(payload, publisher, organisationID, 'Publisher videos')
    const session = await upload(publisher, folder.id)
    await deleteMediaFolder(payload, administrator, folder.id)
    await expect(listVisibleAssets(payload, publisher, {}, organisationID)).resolves.toEqual([
      expect.objectContaining({ folderID: null, mediaAssetId: session.asset.mediaAssetId }),
    ])
    const asset = await payload.find({
      collection: 'media-assets',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { mediaAssetId: { equals: session.asset.mediaAssetId } },
    })
    expect(asset.docs[0]).toMatchObject({ folder: null, mediaAssetId: session.asset.mediaAssetId })
  })
})
