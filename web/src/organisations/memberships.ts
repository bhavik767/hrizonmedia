import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { recordAuditEvent } from '@/audit/events'
import {
  requireOrganisationAdministrator,
  OrganisationAuthorizationError,
} from '@/organisations/authorization'
import type { OrganisationMembership, PilotMember } from '@/payload-types'

export class OrganisationMembershipError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

function relationID(value: number | { id: number } | null | undefined): number | null {
  if (typeof value === 'number') return value
  return value?.id ?? null
}

async function requireAdministrator(payload: Payload, actor: PilotMember, organisationID: number): Promise<void> {
  if (!Number.isSafeInteger(organisationID) || organisationID <= 0) {
    throw new OrganisationMembershipError('A valid Organisation is required.', 400)
  }
  try {
    await requireOrganisationAdministrator(payload, actor, organisationID)
  } catch (error) {
    if (error instanceof OrganisationAuthorizationError) {
      throw new OrganisationMembershipError(error.message, error.status)
    }
    throw error
  }
}

async function findMembership(
  payload: Payload,
  organisationID: number,
  membershipID: number,
  transactionID?: number | string,
): Promise<OrganisationMembership> {
  if (!Number.isSafeInteger(membershipID) || membershipID <= 0) {
    throw new OrganisationMembershipError('A valid Organisation Membership is required.', 400)
  }
  const membership = await payload.findByID({
    collection: 'organisation-memberships',
    depth: 0,
    id: membershipID,
    overrideAccess: true,
    req: transactionID ? { payload, transactionID } : undefined,
  })
  if (relationID(membership.organisation) !== organisationID) {
    throw new OrganisationMembershipError('Organisation Membership not found.', 404)
  }
  return membership
}

async function preventFinalAdministratorLoss(
  payload: Payload,
  membership: OrganisationMembership,
  transaction: { execute: (query: unknown) => Promise<unknown> },
): Promise<void> {
  if (membership.role !== 'administrator' || membership.status !== 'active') return

  const organisationID = relationID(membership.organisation)
  const administrators = (await transaction.execute(sql`
    SELECT id
    FROM organisation_memberships
    WHERE organisation_id = ${organisationID}
      AND role = 'administrator'
      AND status = 'active'
    FOR UPDATE
  `)) as unknown as { rows: Array<{ id: number }> }
  if (administrators.rows.length <= 1) {
    throw new OrganisationMembershipError(
      'An Organisation cannot lose its final active Organisation Administrator.',
      409,
    )
  }
}

async function revokeMembershipAccess(
  payload: Payload,
  membership: OrganisationMembership,
  options: { removeMediaAccess?: boolean } = {},
  transactionID?: number | string,
): Promise<void> {
  const organisationID = relationID(membership.organisation)
  const memberID = relationID(membership.member)
  if (!organisationID || !memberID) throw new Error('Organisation Membership is incomplete.')

  if (options.removeMediaAccess) {
    await payload.delete({
      collection: 'media-access',
      overrideAccess: true,
      req: transactionID ? { payload, transactionID } : undefined,
      where: { membership: { equals: membership.id } },
    })
  } else {
    await payload.update({
      collection: 'media-access',
      data: { status: 'revoked' },
      overrideAccess: true,
      req: transactionID ? { payload, transactionID } : undefined,
      where: { membership: { equals: membership.id } },
    })
  }
  await payload.delete({
    collection: 'playback-grants',
    overrideAccess: true,
    req: transactionID ? { payload, transactionID } : undefined,
    where: {
      and: [{ organisation: { equals: organisationID } }, { owner: { equals: memberID } }],
    },
  })
}

export async function disableOrganisationMembership({
  actor,
  membershipID,
  now = new Date(),
  organisationID,
  payload,
}: {
  actor: PilotMember
  membershipID: number
  now?: Date
  organisationID: number
  payload: Payload
}): Promise<OrganisationMembership> {
  await requireAdministrator(payload, actor, organisationID)
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new Error('Organisation Membership changes require database transactions.')

  try {
    const transaction = payload.db.sessions?.[String(transactionID)]?.db as
      | { execute: (query: unknown) => Promise<unknown> }
      | undefined
    if (!transaction) throw new Error('Unable to start the Organisation Membership transaction.')
    const membership = await findMembership(payload, organisationID, membershipID, transactionID)
    await preventFinalAdministratorLoss(payload, membership, transaction)
    await revokeMembershipAccess(payload, membership, {}, transactionID)
    const disabled = await payload.update({
      collection: 'organisation-memberships',
      data: { status: 'disabled' },
      id: membership.id,
      overrideAccess: true,
      req: { payload, transactionID },
    })
    await recordAuditEvent(payload, {
      action: 'member_disabled',
      actorID: actor.id,
      eventKey: `organisation-membership:${membership.id}:disabled:${now.toISOString()}`,
      memberID: relationID(membership.member) ?? undefined,
      organisationID,
      occurredAt: now,
      req: { payload, transactionID },
    })
    await payload.db.commitTransaction(transactionID)
    return disabled
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}

export async function removeOrganisationMembership({
  actor,
  membershipID,
  now = new Date(),
  organisationID,
  payload,
}: {
  actor: PilotMember
  membershipID: number
  now?: Date
  organisationID: number
  payload: Payload
}): Promise<void> {
  await requireAdministrator(payload, actor, organisationID)
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new Error('Organisation Membership changes require database transactions.')

  try {
    const transaction = payload.db.sessions?.[String(transactionID)]?.db as
      | { execute: (query: unknown) => Promise<unknown> }
      | undefined
    if (!transaction) throw new Error('Unable to start the Organisation Membership transaction.')
    const membership = await findMembership(payload, organisationID, membershipID, transactionID)
    await preventFinalAdministratorLoss(payload, membership, transaction)
    await revokeMembershipAccess(payload, membership, { removeMediaAccess: true }, transactionID)
    await payload.delete({
      collection: 'organisation-memberships',
      id: membership.id,
      overrideAccess: true,
      req: { payload, transactionID },
    })
    await recordAuditEvent(payload, {
      action: 'member_disabled',
      actorID: actor.id,
      details: { removed: true },
      eventKey: `organisation-membership:${membership.id}:removed:${now.toISOString()}`,
      memberID: relationID(membership.member) ?? undefined,
      organisationID,
      occurredAt: now,
      req: { payload, transactionID },
    })
    await payload.db.commitTransaction(transactionID)
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}
