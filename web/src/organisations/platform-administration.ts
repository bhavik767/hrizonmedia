import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import {
  OrganisationAuthorizationError,
  requirePlatformAdministrator as requireAuthorisedPlatformAdministrator,
} from '@/organisations/authorization'
import type {
  Organisation,
  OrganisationMembership,
  Member,
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

function validEntityID(entityID: number): boolean {
  return Number.isSafeInteger(entityID) && entityID > 0
}

async function requirePlatformAdministrator(payload: Payload, actor: Member): Promise<void> {
  try {
    await requireAuthorisedPlatformAdministrator(payload, actor)
  } catch (error) {
    if (error instanceof OrganisationAuthorizationError) {
      throw new PlatformAdministrationError(error.message, error.status)
    }
    throw error
  }
}

async function requireActiveMember(payload: Payload, memberID: number): Promise<Member> {
  if (!validEntityID(memberID)) {
    throw new PlatformAdministrationError('A valid Member is required.', 400)
  }

  const member = await payload.findByID({
    collection: 'members',
    depth: 0,
    id: memberID,
    overrideAccess: true,
  })
  if (member.status !== 'active') {
    throw new PlatformAdministrationError('The appointed Member must be active.', 409)
  }
  return member
}

async function beginTransaction(payload: Payload): Promise<number | string> {
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) {
    throw new Error('Organisation administration requires database transactions.')
  }
  return transactionID
}

export async function createOrganisation(
  payload: Payload,
  actor: Member,
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
  actor: Member,
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
    throw new PlatformAdministrationError(
      'This Member is already a Platform Administrator.',
      409,
    )
  }

  return payload.create({
    collection: 'platform-administrators',
    data: { member: member.id, status: 'active' },
    overrideAccess: true,
  })
}

export async function deleteOrganisation(
  payload: Payload,
  actor: Member,
  input: { now?: Date; organisationID: number },
): Promise<Organisation> {
  await requirePlatformAdministrator(payload, actor)
  if (!validEntityID(input.organisationID)) {
    throw new PlatformAdministrationError('A valid Organisation is required.', 400)
  }

  const organisation = await payload.findByID({
    collection: 'organisations',
    depth: 0,
    id: input.organisationID,
    overrideAccess: true,
  })
  if (organisation.status === 'deleted') return organisation

  const now = input.now ?? new Date()
  const transactionID = await beginTransaction(payload)
  const req = { payload, transactionID } as PayloadRequest
  try {
    const assets = await payload.find({
      collection: 'media-assets',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      req,
      where: { organisation: { equals: organisation.id } },
    })
    await payload.delete({
      collection: 'playback-grants',
      overrideAccess: true,
      req,
      where: { organisation: { equals: organisation.id } },
    })
    for (const asset of assets.docs) {
      if (asset.status === 'deleted') continue
      await payload.update({
        collection: 'media-assets',
        data: {
          deletedAt: now.toISOString(),
          deletedBy: actor.id,
          status: 'deleted',
          statusChangedAt: now.toISOString(),
        },
        id: asset.id,
        overrideAccess: true,
        req,
      })
    }
    const deleted = await payload.update({
      collection: 'organisations',
      data: { status: 'deleted' },
      id: organisation.id,
      overrideAccess: true,
      req,
    })
    await payload.db.commitTransaction(transactionID)
    return deleted
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}
