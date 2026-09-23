import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  authorizeOrganisationMedia,
  OrganisationAuthorizationError,
} from '@/organisations/authorization'
import { authorizePlaybackResource, createPlaybackGrant } from '@/media/playback'
import type { MediaAssetId } from '@/media/identifiers'
import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'

let payload: Payload
let publisher: PilotMember
let organisationID: number
let assetID: number

async function cleanOrganisationFoundation() {
  await payload.delete({
    collection: 'audit-events',
    overrideAccess: true,
    where: { eventKey: { contains: 'platform-recovery:' } },
  })
  await payload.delete({ collection: 'media-access', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'playback-grants', overrideAccess: true, where: {} })
  await payload.delete({
    collection: 'media-assets',
    overrideAccess: true,
    where: { mediaAssetId: { contains: 'media_organisation_' } },
  })
  await payload.delete({ collection: 'organisation-settings', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'platform-administrators', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({
    collection: 'pilot-members',
    overrideAccess: true,
    where: { email: { contains: '@organisation-foundation.test' } },
  })
}

async function createPilotMember(email: string): Promise<PilotMember> {
  return payload.create({
    collection: 'pilot-members',
    data: {
      email,
      invitationAcceptedAt: new Date().toISOString(),
      name: email,
      password: 'organisation-foundation-password',
      role: 'uploader',
      status: 'active',
    },
    overrideAccess: true,
  })
}

describe('Organisation media authorization', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    await cleanOrganisationFoundation()
    publisher = await createPilotMember('publisher@organisation-foundation.test')
    const organisation = await payload.create({
      collection: 'organisations',
      data: { name: 'Example Organisation', status: 'active' },
      overrideAccess: true,
    })
    organisationID = organisation.id
    await payload.create({
      collection: 'organisation-memberships',
      data: { member: publisher.id, organisation: organisation.id, role: 'publisher', status: 'active' },
      overrideAccess: true,
    })
    const asset = await payload.create({
      collection: 'media-assets',
      data: {
        fileName: 'organisation-fixture.mp4',
        mediaAssetId: `media_organisation_${organisation.id}`,
        mimeType: 'video/mp4',
        organisation: organisation.id,
        owner: publisher.id,
        size: 1,
        status: 'ready',
        statusChangedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
    assetID = asset.id
  })

  afterAll(async () => {
    await cleanOrganisationFoundation()
  })

  it('authorizes an active publisher to manage a Media Asset they own', async () => {
    await expect(
      authorizeOrganisationMedia(payload, publisher, { assetID, operation: 'manage' }),
    ).resolves.toMatchObject({
      organisationID,
      recoveryAccess: false,
      role: 'publisher',
    })
  })

  it('denies a disabled Organisation Membership', async () => {
    const membership = await payload.find({
      collection: 'organisation-memberships',
      limit: 1,
      overrideAccess: true,
      where: { member: { equals: publisher.id } },
    })
    await payload.update({
      collection: 'organisation-memberships',
      data: { status: 'disabled' },
      id: membership.docs[0]!.id,
      overrideAccess: true,
    })

    await expect(
      authorizeOrganisationMedia(payload, publisher, { assetID, operation: 'read' }),
    ).rejects.toBeInstanceOf(OrganisationAuthorizationError)
  })

  it('lets a Viewer read only a Media Asset explicitly shared through Media Access', async () => {
    const viewer = await createPilotMember('viewer@organisation-foundation.test')
    const membership = await payload.create({
      collection: 'organisation-memberships',
      data: { member: viewer.id, organisation: organisationID, role: 'viewer', status: 'active' },
      overrideAccess: true,
    })

    await expect(
      authorizeOrganisationMedia(payload, viewer, { assetID, operation: 'read' }),
    ).rejects.toBeInstanceOf(OrganisationAuthorizationError)

    await payload.create({
      collection: 'media-access',
      data: { asset: assetID, membership: membership.id, status: 'active' },
      overrideAccess: true,
    })

    await expect(
      authorizeOrganisationMedia(payload, viewer, { assetID, operation: 'read' }),
    ).resolves.toMatchObject({ membershipID: membership.id, recoveryAccess: false, role: 'viewer' })

    await payload.update({
      collection: 'media-assets',
      data: { status: 'processing' },
      id: assetID,
      overrideAccess: true,
    })
    await expect(
      authorizeOrganisationMedia(payload, viewer, { assetID, operation: 'read' }),
    ).rejects.toBeInstanceOf(OrganisationAuthorizationError)
  })

  it('revokes an Organisation Viewer Playback Grant when their Membership is disabled', async () => {
    const viewer = await createPilotMember('revoked-viewer@organisation-foundation.test')
    const membership = await payload.create({
      collection: 'organisation-memberships',
      data: { member: viewer.id, organisation: organisationID, role: 'viewer', status: 'active' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'media-access',
      data: { asset: assetID, membership: membership.id, status: 'active' },
      overrideAccess: true,
    })
    const now = new Date('2026-09-23T06:00:00.000Z')
    const asset = await payload.update({
      collection: 'media-assets',
      data: {
        drmContentId: 'drm_organisation_fixture',
        expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      },
      id: assetID,
      overrideAccess: true,
    })
    const mediaAssetId = asset.mediaAssetId as MediaAssetId
    const grant = await createPlaybackGrant(payload, viewer, mediaAssetId, { now })

    await payload.update({
      collection: 'organisation-memberships',
      data: { status: 'disabled' },
      id: membership.id,
      overrideAccess: true,
    })
    await expect(
      authorizePlaybackResource(payload, viewer, grant.deliveryToken, mediaAssetId, {
        now: new Date(now.getTime() + 1_000),
      }),
    ).rejects.toBeInstanceOf(OrganisationAuthorizationError)
  })

  it('gives an active Platform Administrator audited recovery access without a Membership', async () => {
    const administrator = await createPilotMember('platform-admin@organisation-foundation.test')
    await payload.create({
      collection: 'platform-administrators',
      data: { member: administrator.id, status: 'active' },
      overrideAccess: true,
    })

    await expect(
      authorizeOrganisationMedia(payload, administrator, { assetID, operation: 'manage' }),
    ).resolves.toMatchObject({
      membershipID: null,
      organisationID,
      recoveryAccess: true,
      role: 'platform-administrator',
    })
    await expect(
      payload.find({
        collection: 'audit-events',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: { action: { equals: 'platform_recovery_accessed' } },
      }),
    ).resolves.toMatchObject({ docs: [expect.objectContaining({ actor: administrator.id })] })

    await expect(
      authorizeOrganisationMedia(payload, administrator, {
        operation: 'create',
        organisationID,
      }),
    ).resolves.toMatchObject({ recoveryAccess: true })
    await expect(
      payload.find({
        collection: 'audit-events',
        depth: 0,
        limit: 10,
        overrideAccess: true,
        where: { action: { equals: 'platform_recovery_accessed' } },
      }),
    ).resolves.toMatchObject({ totalDocs: 2 })
  })
})
