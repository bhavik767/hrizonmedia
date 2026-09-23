import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DELETE as deleteOrganisationRoute } from '@/app/(frontend)/api/demo/organisations/[organisationID]/route'
import {
  createOrganisation,
  createPlatformAdministrator,
  PlatformAdministrationError,
} from '@/organisations/platform-administration'
import {
  newMediaAssetId,
  newProcessingJobId,
  newUploadSessionId,
  type MediaAssetId,
} from '@/media/identifiers'
import { runMediaLifecycle } from '@/media/lifecycle'
import {
  authorizePlaybackResource,
  createPlaybackGrant,
  PlaybackAuthorizationError,
} from '@/media/playback'
import { getFakeProviders } from '@/media/providers/fake'
import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'

let payload: Payload

async function cleanPlatformAdministration() {
  await payload.delete({ collection: 'audit-events', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'playback-grants', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-access', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'processing-jobs', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'upload-sessions', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-assets', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'platform-administrators', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({
    collection: 'pilot-members',
    overrideAccess: true,
    where: { email: { contains: '@platform-administration.test' } },
  })
}

async function createPilotMember(email: string): Promise<PilotMember> {
  return payload.create({
    collection: 'pilot-members',
    data: {
      email,
      invitationAcceptedAt: new Date().toISOString(),
      name: email,
      password: 'platform-administration-password',
      role: 'uploader',
      status: 'active',
    },
    overrideAccess: true,
  })
}

describe('Platform Administration', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(cleanPlatformAdministration)

  afterAll(cleanPlatformAdministration)

  it('provisions an active Organisation and appoints its initial active Organisation Administrator', async () => {
    const platformAdministrator = await createPilotMember(
      'platform-administrator@platform-administration.test',
    )
    const initialAdministrator = await createPilotMember(
      'initial-administrator@platform-administration.test',
    )
    await payload.create({
      collection: 'platform-administrators',
      data: { member: platformAdministrator.id, status: 'active' },
      overrideAccess: true,
    })

    const provisioned = await createOrganisation(payload, platformAdministrator, {
      initialAdministratorID: initialAdministrator.id,
      name: 'Example Organisation',
    })

    expect(provisioned.organisation).toMatchObject({
      name: 'Example Organisation',
      status: 'active',
    })
    expect(provisioned.initialAdministratorMembership).toMatchObject({
      member: expect.objectContaining({ id: initialAdministrator.id }),
      organisation: expect.objectContaining({ id: provisioned.organisation.id }),
      role: 'administrator',
      status: 'active',
    })
  })

  it('prevents every Organisation role from creating Organisations or Platform Administrators', async () => {
    const target = await createPilotMember('target@platform-administration.test')
    const organisation = await payload.create({
      collection: 'organisations',
      data: { name: 'Existing Organisation', status: 'active' },
      overrideAccess: true,
    })
    const organisationMembers = await Promise.all(
      (['administrator', 'publisher', 'viewer'] as const).map(async (role) => {
        const member = await createPilotMember(`${role}@platform-administration.test`)
        await payload.create({
          collection: 'organisation-memberships',
          data: { member: member.id, organisation: organisation.id, role, status: 'active' },
          overrideAccess: true,
        })
        return member
      }),
    )

    for (const member of organisationMembers) {
      await expect(
        createOrganisation(payload, member, {
          initialAdministratorID: target.id,
          name: 'Unauthorised Organisation',
        }),
      ).rejects.toBeInstanceOf(PlatformAdministrationError)
      await expect(
        createPlatformAdministrator(payload, member, { memberID: target.id }),
      ).rejects.toBeInstanceOf(PlatformAdministrationError)
    }

    await expect(
      payload.find({
        collection: 'organisations',
        depth: 0,
        overrideAccess: true,
        where: { name: { equals: 'Unauthorised Organisation' } },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
    await expect(
      payload.find({
        collection: 'platform-administrators',
        depth: 0,
        overrideAccess: true,
        where: { member: { equals: target.id } },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
  })

  it('lets a Platform Administrator appoint another active Platform Administrator', async () => {
    const platformAdministrator = await createPilotMember('creator@platform-administration.test')
    const target = await createPilotMember('appointed@platform-administration.test')
    await payload.create({
      collection: 'platform-administrators',
      data: { member: platformAdministrator.id, status: 'active' },
      overrideAccess: true,
    })

    await expect(
      createPlatformAdministrator(payload, platformAdministrator, { memberID: target.id }),
    ).resolves.toMatchObject({
      member: expect.objectContaining({ id: target.id }),
      status: 'active',
    })
  })

  it('revokes every Organisation Playback Grant before retrying failed cleanup', async () => {
    const now = new Date('2026-09-23T12:00:00.000Z')
    const platformAdministrator = await createPilotMember(
      'deleting-platform-administrator@platform-administration.test',
    )
    const publisher = await createPilotMember('deleting-publisher@platform-administration.test')
    const viewer = await createPilotMember('deleting-viewer@platform-administration.test')
    await payload.create({
      collection: 'platform-administrators',
      data: { member: platformAdministrator.id, status: 'active' },
      overrideAccess: true,
    })
    const organisation = await payload.create({
      collection: 'organisations',
      data: { name: 'Deleting Organisation', status: 'active' },
      overrideAccess: true,
    })
    await Promise.all([
      payload.create({
        collection: 'organisation-memberships',
        data: {
          member: publisher.id,
          organisation: organisation.id,
          role: 'publisher',
          status: 'active',
        },
        overrideAccess: true,
      }),
      payload.create({
        collection: 'organisation-memberships',
        data: {
          member: viewer.id,
          organisation: organisation.id,
          role: 'viewer',
          status: 'active',
        },
        overrideAccess: true,
      }),
    ])
    const mediaAssetId = newMediaAssetId()
    const asset = await payload.create({
      collection: 'media-assets',
      data: {
        drmContentId: `drm_${crypto.randomUUID()}`,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        fileName: 'deleting-organisation.mp4',
        mediaAssetId,
        mimeType: 'video/mp4',
        organisation: organisation.id,
        owner: publisher.id,
        size: 1024,
        status: 'ready',
        statusChangedAt: now.toISOString(),
      },
      overrideAccess: true,
    })
    const viewerMembership = await payload.find({
      collection: 'organisation-memberships',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [{ member: { equals: viewer.id } }, { organisation: { equals: organisation.id } }],
      },
    })
    await payload.create({
      collection: 'media-access',
      data: { asset: asset.id, membership: viewerMembership.docs[0]!.id, status: 'active' },
      overrideAccess: true,
    })
    const uploadSessionId = newUploadSessionId()
    const processingJobId = newProcessingJobId()
    await payload.create({
      collection: 'upload-sessions',
      data: {
        asset: asset.id,
        expiresAt: now.toISOString(),
        fileFingerprint: 'deleting-organisation',
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        objectKey: `sources/${uploadSessionId}/source.mp4`,
        organisation: organisation.id,
        owner: publisher.id,
        partSize: 5 * 1024 * 1024,
        providerUploadId: `provider_upload_${crypto.randomUUID()}`,
        size: asset.size,
        status: 'completed',
        uploadSessionId,
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'processing-jobs',
      data: {
        asset: asset.id,
        attempts: 1,
        dispatchBy: now.toISOString(),
        nextAttemptAt: now.toISOString(),
        objectKey: `sources/${uploadSessionId}/source.mp4`,
        organisation: organisation.id,
        owner: publisher.id,
        processingJobId,
        providerJobId: `provider_job_${crypto.randomUUID()}`,
        queuedAt: now.toISOString(),
        readyAt: now.toISOString(),
        renditions: [],
        sourceDurationSeconds: 60,
        sourceHeight: 1080,
        sourceWidth: 1920,
        status: 'ready',
      },
      overrideAccess: true,
    })
    const grant = await createPlaybackGrant(payload, viewer, mediaAssetId, { now })

    const deniedAuth = vi.spyOn(payload, 'auth').mockResolvedValue({ user: publisher } as never)
    const denied = await deleteOrganisationRoute(
      new Request(`http://localhost:3000/api/demo/organisations/${organisation.id}`, {
        headers: { origin: 'http://localhost:3000' },
        method: 'DELETE',
      }),
      { params: Promise.resolve({ organisationID: String(organisation.id) }) },
    )
    deniedAuth.mockRestore()
    expect(denied.status).toBe(403)

    const auth = vi
      .spyOn(payload, 'auth')
      .mockResolvedValue({ user: platformAdministrator } as never)
    const response = await deleteOrganisationRoute(
      new Request(`http://localhost:3000/api/demo/organisations/${organisation.id}`, {
        headers: { origin: 'http://localhost:3000' },
        method: 'DELETE',
      }),
      { params: Promise.resolve({ organisationID: String(organisation.id) }) },
    )
    auth.mockRestore()
    expect(response.status).toBe(204)

    await expect(
      authorizePlaybackResource(
        payload,
        viewer,
        grant.deliveryToken,
        mediaAssetId as MediaAssetId,
        {
          now: new Date(now.getTime() + 1_000),
        },
      ),
    ).rejects.toBeInstanceOf(PlaybackAuthorizationError)
    await expect(
      payload.findByID({ collection: 'organisations', id: organisation.id, overrideAccess: true }),
    ).resolves.toMatchObject({ status: 'deleted' })

    const providers = getFakeProviders()
    const revokeAsset = vi
      .fn()
      .mockRejectedValueOnce(new Error('delivery unavailable'))
      .mockResolvedValue(undefined)
    const deleteObject = vi.fn(async () => undefined)
    const deleteOutputs = vi.fn(async () => undefined)
    providers.delivery = { ...providers.delivery, revokeAsset }
    providers.storage = { ...providers.storage, deleteObject }
    providers.transcode = { ...providers.transcode, deleteOutputs }

    await runMediaLifecycle(payload, { now, providers })
    expect(revokeAsset).toHaveBeenCalledOnce()
    expect(deleteObject).not.toHaveBeenCalled()
    expect(deleteOutputs).not.toHaveBeenCalled()

    await runMediaLifecycle(payload, { now, providers })
    expect(revokeAsset).toHaveBeenCalledTimes(2)
    expect(deleteObject).toHaveBeenCalledOnce()
    expect(deleteOutputs).toHaveBeenCalledOnce()
  })
})
