import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import {
  disableOrganisationMembership,
  removeOrganisationMembership,
} from '@/organisations/memberships'
import { authorizeOrganisationMedia, OrganisationAuthorizationError } from '@/organisations/authorization'
import { createPlaybackGrant } from '@/media/playback'
import type { MediaAssetId } from '@/media/identifiers'
import type { Member } from '@/payload-types'

let payload: Payload
let administrator: Member
let organisationID: number
let viewer: Member
let viewerMembershipID: number
let mediaAssetDatabaseID: number
let mediaAssetID: MediaAssetId

async function createMember(email: string): Promise<Member> {
  return payload.create({
    collection: 'members',
    data: {
      email,
      name: email,
      password: 'organisation-membership-password',
      status: 'active',
    },
    overrideAccess: true,
  })
}

async function cleanOrganisationMemberships() {
  await payload.delete({ collection: 'media-access', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'playback-grants', overrideAccess: true, where: {} })
  await payload.delete({
    collection: 'media-assets',
    overrideAccess: true,
    where: { mediaAssetId: { contains: 'media_membership_' } },
  })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({
    collection: 'members',
    overrideAccess: true,
    where: { email: { contains: '@organisation-membership.test' } },
  })
}

describe('Organisation Membership management', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    await cleanOrganisationMemberships()
    administrator = await createMember('administrator@organisation-membership.test')
    viewer = await createMember('viewer@organisation-membership.test')
    const organisation = await payload.create({
      collection: 'organisations',
      data: { name: 'Membership Organisation', status: 'active' },
      overrideAccess: true,
    })
    organisationID = organisation.id
    await payload.create({
      collection: 'organisation-memberships',
      data: { member: administrator.id, organisation: organisationID, role: 'administrator', status: 'active' },
      overrideAccess: true,
    })
    const viewerMembership = await payload.create({
      collection: 'organisation-memberships',
      data: { member: viewer.id, organisation: organisationID, role: 'viewer', status: 'active' },
      overrideAccess: true,
    })
    viewerMembershipID = viewerMembership.id
    const mediaAsset = await payload.create({
      collection: 'media-assets',
      data: {
        drmContentId: 'drm_membership_fixture',
        expiresAt: new Date('2026-09-24T06:00:00.000Z').toISOString(),
        fileName: 'membership-fixture.mp4',
        mediaAssetId: `media_membership_${organisationID}`,
        mimeType: 'video/mp4',
        organisation: organisationID,
        owner: administrator.id,
        size: 1,
        status: 'ready',
        statusChangedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
    mediaAssetDatabaseID = mediaAsset.id
    mediaAssetID = mediaAsset.mediaAssetId as MediaAssetId
    await payload.create({
      collection: 'media-access',
      data: { asset: mediaAsset.id, membership: viewerMembershipID, status: 'active' },
      overrideAccess: true,
    })
  })

  afterAll(async () => {
    await cleanOrganisationMemberships()
  })

  it('disables a Membership and immediately revokes its Media Access and Playback Grants', async () => {
    const now = new Date('2026-09-23T06:00:00.000Z')
    await createPlaybackGrant(payload, viewer, mediaAssetID, { now })

    await disableOrganisationMembership({
      actor: administrator,
      membershipID: viewerMembershipID,
      now,
      organisationID,
      payload,
    })

    await expect(
      authorizeOrganisationMedia(payload, viewer, { operation: 'play', assetID: mediaAssetDatabaseID }),
    ).rejects.toBeInstanceOf(OrganisationAuthorizationError)
    await expect(
      payload.find({
        collection: 'playback-grants',
        limit: 1,
        overrideAccess: true,
        where: { owner: { equals: viewer.id } },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
  })

  it('removes a Membership and immediately revokes its Playback Grants', async () => {
    const now = new Date('2026-09-23T06:00:00.000Z')
    await createPlaybackGrant(payload, viewer, mediaAssetID, { now })

    await removeOrganisationMembership({
      actor: administrator,
      membershipID: viewerMembershipID,
      now,
      organisationID,
      payload,
    })

    await expect(
      authorizeOrganisationMedia(payload, viewer, { operation: 'play', assetID: mediaAssetDatabaseID }),
    ).rejects.toBeInstanceOf(OrganisationAuthorizationError)
    await expect(
      payload.find({
        collection: 'playback-grants',
        limit: 1,
        overrideAccess: true,
        where: { owner: { equals: viewer.id } },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
  })

  it('prevents an Organisation from disabling or removing its final active administrator', async () => {
    const memberships = await payload.find({
      collection: 'organisation-memberships',
      limit: 1,
      overrideAccess: true,
      where: { member: { equals: administrator.id } },
    })
    const administratorMembershipID = memberships.docs[0]!.id

    await expect(
      disableOrganisationMembership({
        actor: administrator,
        membershipID: administratorMembershipID,
        organisationID,
        payload,
      }),
    ).rejects.toThrow('final active Organisation Administrator')
    await expect(
      removeOrganisationMembership({
        actor: administrator,
        membershipID: administratorMembershipID,
        organisationID,
        payload,
      }),
    ).rejects.toThrow('final active Organisation Administrator')
  })
})
