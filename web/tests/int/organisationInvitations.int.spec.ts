import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import {
  acceptOrganisationInvitation,
  acceptOrganisationInvitationWithPassword,
  createOrganisationInvitation,
} from '@/organisations/invitations'
import type { Member } from '@/payload-types'

let payload: Payload

async function createMember(email: string): Promise<Member> {
  return payload.create({
    collection: 'members',
    data: {
      email,
      name: email,
      password: 'organisation-invitation-password',
      status: 'active',
    },
    overrideAccess: true,
  })
}

async function cleanOrganisationInvitations() {
  await payload.delete({ collection: 'organisation-invitations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({
    collection: 'members',
    overrideAccess: true,
    where: { email: { contains: '@organisation-invitation.test' } },
  })
}

describe('Organisation Invitations', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    await cleanOrganisationInvitations()
  })

  afterAll(async () => {
    await cleanOrganisationInvitations()
  })

  it('creates a seven-day, role-bound invitation which an authenticated person accepts once', async () => {
    const administrator = await createMember('administrator@organisation-invitation.test')
    const recipient = await createMember('recipient@organisation-invitation.test')
    const organisation = await payload.create({
      collection: 'organisations',
      data: { name: 'Invitation Organisation', status: 'active' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: administrator.id,
        organisation: organisation.id,
        role: 'administrator',
        status: 'active',
      },
      overrideAccess: true,
    })
    const now = new Date('2026-09-23T06:00:00.000Z')

    const invitation = await createOrganisationInvitation({
      actor: administrator,
      email: recipient.email,
      name: recipient.name,
      now,
      organisationID: organisation.id,
      payload,
      role: 'viewer',
    })
    const membership = await acceptOrganisationInvitation({
      actor: recipient,
      now: new Date('2026-09-23T07:00:00.000Z'),
      payload,
      token: invitation.token,
    })

    expect(invitation.expiresAt).toBe('2026-09-30T06:00:00.000Z')
    expect(membership).toMatchObject({
      member: expect.objectContaining({ id: recipient.id }),
      organisation: expect.objectContaining({ id: organisation.id }),
      role: 'viewer',
      status: 'active',
    })
    await expect(
      acceptOrganisationInvitation({
        actor: administrator,
        now: new Date('2026-09-23T07:01:00.000Z'),
        payload,
        token: invitation.token,
      }),
    ).rejects.toThrow('invalid or has already been used')
  })

  it('rejects an expired Organisation Invitation', async () => {
    const administrator = await createMember('expired-admin@organisation-invitation.test')
    const recipient = await createMember('expired-recipient@organisation-invitation.test')
    const organisation = await payload.create({
      collection: 'organisations',
      data: { name: 'Expired Invitation Organisation', status: 'active' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: administrator.id,
        organisation: organisation.id,
        role: 'administrator',
        status: 'active',
      },
      overrideAccess: true,
    })
    const invitation = await createOrganisationInvitation({
      actor: administrator,
      email: recipient.email,
      name: recipient.name,
      now: new Date('2026-09-23T06:00:00.000Z'),
      organisationID: organisation.id,
      payload,
      role: 'publisher',
    })

    await expect(
      acceptOrganisationInvitation({
        actor: recipient,
        now: new Date('2026-09-30T06:00:00.001Z'),
        payload,
        token: invitation.token,
      }),
    ).rejects.toThrow('expired')
  })

  it('consumes the first acceptance by an existing member and applies the invited role', async () => {
    const administrator = await createMember('existing-admin@organisation-invitation.test')
    const recipient = await createMember('existing-recipient@organisation-invitation.test')
    const organisation = await payload.create({
      collection: 'organisations',
      data: { name: 'Existing Member Organisation', status: 'active' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: administrator.id,
        organisation: organisation.id,
        role: 'administrator',
        status: 'active',
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: recipient.id,
        organisation: organisation.id,
        role: 'viewer',
        status: 'active',
      },
      overrideAccess: true,
    })
    const invitation = await createOrganisationInvitation({
      actor: administrator,
      email: recipient.email,
      name: recipient.name,
      organisationID: organisation.id,
      payload,
      role: 'publisher',
    })

    await expect(
      acceptOrganisationInvitation({ actor: recipient, payload, token: invitation.token }),
    ).resolves.toMatchObject({ role: 'publisher', status: 'active' })
    await expect(
      acceptOrganisationInvitation({ actor: administrator, payload, token: invitation.token }),
    ).rejects.toThrow('invalid or has already been used')
  })

  it('creates the invited Member when they choose a password from their one-time link', async () => {
    const administrator = await createMember('new-member-admin@organisation-invitation.test')
    const organisation = await payload.create({
      collection: 'organisations',
      data: { name: 'New Member Organisation', status: 'active' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: administrator.id,
        organisation: organisation.id,
        role: 'administrator',
        status: 'active',
      },
      overrideAccess: true,
    })

    const invitation = await createOrganisationInvitation({
      actor: administrator,
      email: 'new-member@organisation-invitation.test',
      name: 'New Member',
      organisationID: organisation.id,
      payload,
      role: 'publisher',
    })

    await expect(
      acceptOrganisationInvitationWithPassword({
        password: 'new-member-password',
        payload,
        token: invitation.token,
      }),
    ).resolves.toMatchObject({
      role: 'publisher',
      status: 'active',
      member: expect.objectContaining({
        email: 'new-member@organisation-invitation.test',
        name: 'New Member',
      }),
    })
    await expect(
      acceptOrganisationInvitationWithPassword({
        password: 'another-password',
        payload,
        token: invitation.token,
      }),
    ).rejects.toThrow('invalid or has already been used')
  })
})
