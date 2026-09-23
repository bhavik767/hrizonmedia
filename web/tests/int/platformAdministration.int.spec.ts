import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  createOrganisation,
  createPlatformAdministrator,
  PlatformAdministrationError,
} from '@/organisations/platform-administration'
import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'

let payload: Payload

async function cleanPlatformAdministration() {
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

    expect(provisioned.organisation).toMatchObject({ name: 'Example Organisation', status: 'active' })
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
    const platformAdministrator = await createPilotMember(
      'creator@platform-administration.test',
    )
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
})
