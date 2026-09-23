import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import type { MediaAssetId } from '@/media/identifiers'
import {
  authorizePlaybackResource,
  createPlaybackGrant,
  PlaybackAuthorizationError,
} from '@/media/playback'
import {
  grantMediaAccess,
  OrganisationMediaAccessError,
  revokeMediaAccess,
} from '@/organisations/media-access'
import type { PilotMember } from '@/payload-types'

let payload: Payload
let administrator: PilotMember
let organisationID: number
let assetDatabaseID: number
let assetID: MediaAssetId
let viewer: PilotMember
let viewerMembershipID: number

async function createPilotMember(
  email: string,
  role: 'operator' | 'uploader' = 'uploader',
): Promise<PilotMember> {
  return payload.create({
    collection: 'pilot-members',
    data: {
      email,
      invitationAcceptedAt: new Date().toISOString(),
      name: email,
      password: 'organisation-media-access-password',
      role,
      status: 'active',
    },
    overrideAccess: true,
  })
}

async function cleanOrganisationMediaAccess() {
  await payload.delete({ collection: 'media-access', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'playback-grants', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'platform-administrators', overrideAccess: true, where: {} })
  await payload.delete({
    collection: 'media-assets',
    overrideAccess: true,
    where: { mediaAssetId: { contains: 'media_access_' } },
  })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({
    collection: 'pilot-members',
    overrideAccess: true,
    where: { email: { contains: '@organisation-media-access.test' } },
  })
}

describe('Organisation Media Access', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    await cleanOrganisationMediaAccess()
    administrator = await createPilotMember('administrator@organisation-media-access.test')
    viewer = await createPilotMember('viewer@organisation-media-access.test', 'operator')
    const organisation = await payload.create({
      collection: 'organisations',
      data: { name: 'Media Access Organisation', status: 'active' },
      overrideAccess: true,
    })
    organisationID = organisation.id
    await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: administrator.id,
        organisation: organisationID,
        role: 'administrator',
        status: 'active',
      },
      overrideAccess: true,
    })
    const viewerMembership = await payload.create({
      collection: 'organisation-memberships',
      data: { member: viewer.id, organisation: organisationID, role: 'viewer', status: 'active' },
      overrideAccess: true,
    })
    viewerMembershipID = viewerMembership.id
    const asset = await payload.create({
      collection: 'media-assets',
      data: {
        drmContentId: 'drm_media_access_fixture',
        expiresAt: new Date('2026-09-24T06:00:00.000Z').toISOString(),
        fileName: 'media-access-fixture.mp4',
        mediaAssetId: `media_access_${organisationID}`,
        mimeType: 'video/mp4',
        organisation: organisationID,
        owner: administrator.id,
        size: 1,
        status: 'ready',
        statusChangedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
    assetDatabaseID = asset.id
    assetID = asset.mediaAssetId as MediaAssetId
  })

  afterAll(async () => {
    await cleanOrganisationMediaAccess()
  })

  it('grants an active Viewer access to a ready Organisation Media Asset', async () => {
    await grantMediaAccess({
      actor: administrator,
      assetID: assetDatabaseID,
      membershipID: viewerMembershipID,
      payload,
    })

    await expect(createPlaybackGrant(payload, viewer, assetID)).resolves.toMatchObject({
      playbackGrantId: expect.any(String),
    })
  })

  it('rejects sharing with a Membership outside the owning Organisation', async () => {
    const anotherOrganisation = await payload.create({
      collection: 'organisations',
      data: { name: 'Another Organisation', status: 'active' },
      overrideAccess: true,
    })
    const otherMembership = await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: viewer.id,
        organisation: anotherOrganisation.id,
        role: 'viewer',
        status: 'active',
      },
      overrideAccess: true,
    })

    await expect(
      grantMediaAccess({
        actor: administrator,
        assetID: assetDatabaseID,
        membershipID: otherMembership.id,
        payload,
      }),
    ).rejects.toBeInstanceOf(OrganisationMediaAccessError)
  })

  it('does not let Platform recovery access change Media Access', async () => {
    await payload.create({
      collection: 'platform-administrators',
      data: { member: administrator.id, status: 'active' },
      overrideAccess: true,
    })

    await expect(
      grantMediaAccess({
        actor: administrator,
        assetID: assetDatabaseID,
        membershipID: viewerMembershipID,
        payload,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('revokes an already-issued Playback Grant immediately', async () => {
    await grantMediaAccess({
      actor: administrator,
      assetID: assetDatabaseID,
      membershipID: viewerMembershipID,
      payload,
    })
    const now = new Date('2026-09-23T06:00:00.000Z')
    const grant = await createPlaybackGrant(payload, viewer, assetID, { now })

    await revokeMediaAccess({
      actor: administrator,
      assetID: assetDatabaseID,
      membershipID: viewerMembershipID,
      now,
      payload,
    })

    await expect(
      authorizePlaybackResource(payload, viewer, grant.deliveryToken, assetID, {
        now: new Date(now.getTime() + 1_000),
      }),
    ).rejects.toBeInstanceOf(PlaybackAuthorizationError)
    await expect(
      payload.find({
        collection: 'playback-grants',
        limit: 1,
        overrideAccess: true,
        where: { owner: { equals: viewer.id } },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
  })
})
