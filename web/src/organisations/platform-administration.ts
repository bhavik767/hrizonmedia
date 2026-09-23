import 'server-only'

import type { Payload } from 'payload'

import {
  OrganisationAuthorizationError,
  requirePlatformAdministrator as requireAuthorisedPlatformAdministrator,
} from '@/organisations/authorization'
import type {
  Organisation,
  OrganisationMembership,
  PilotMember,
  PlatformAdministrator,
} from '@/payload-types'

export class PlatformAdministrationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

function validMemberID(memberID: number): boolean {
  return Number.isSafeInteger(memberID) && memberID > 0
}

async function requirePlatformAdministrator(payload: Payload, actor: PilotMember): Promise<void> {
  try {
    await requireAuthorisedPlatformAdministrator(payload, actor)
  } catch (error) {
    if (error instanceof OrganisationAuthorizationError) {
      throw new PlatformAdministrationError(error.message, error.status)
    }
    throw error
  }
}

async function requireActiveMember(payload: Payload, memberID: number): Promise<PilotMember> {
  if (!validMemberID(memberID)) {
    throw new PlatformAdministrationError('A valid Pilot Member is required.', 400)
  }

  const member = await payload.findByID({
    collection: 'pilot-members',
    depth: 0,
    id: memberID,
    overrideAccess: true,
  })
  if (member.status !== 'active') {
    throw new PlatformAdministrationError('The appointed Pilot Member must be active.', 409)
  }
  return member
}

async function beginTransaction(payload: Payload): Promise<number | string> {
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) {
    throw new Error('Organisation provisioning requires database transactions.')
  }
  return transactionID
}

export async function createOrganisation(
  payload: Payload,
  actor: PilotMember,
  input: { initialAdministratorID: number; name: string },
): Promise<{
  initialAdministratorMembership: OrganisationMembership
  organisation: Organisation
}> {
  await requirePlatformAdministrator(payload, actor)

  const name = input.name.trim()
  if (!name) {
    throw new PlatformAdministrationError('An Organisation name is required.', 400)
  }
  const initialAdministrator = await requireActiveMember(payload, input.initialAdministratorID)
  const transactionID = await beginTransaction(payload)
  const req = { payload, transactionID }

  try {
    const organisation = await payload.create({
      collection: 'organisations',
      data: { initialAdministrator: initialAdministrator.id, name, status: 'active' },
      overrideAccess: true,
      req,
    })
    const initialAdministratorMembership = await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: initialAdministrator.id,
        organisation: organisation.id,
        role: 'administrator',
        status: 'active',
      },
      overrideAccess: true,
      req,
    })
    await payload.db.commitTransaction(transactionID)
    return { initialAdministratorMembership, organisation }
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}

export async function createPlatformAdministrator(
  payload: Payload,
  actor: PilotMember,
  input: { memberID: number },
): Promise<PlatformAdministrator> {
  await requirePlatformAdministrator(payload, actor)
  const member = await requireActiveMember(payload, input.memberID)
  const existing = await payload.find({
    collection: 'platform-administrators',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { member: { equals: member.id } },
  })
  if (existing.docs[0]) {
    throw new PlatformAdministrationError('This Pilot Member is already a Platform Administrator.', 409)
  }

  return payload.create({
    collection: 'platform-administrators',
    data: { member: member.id, status: 'active' },
    overrideAccess: true,
  })
}
