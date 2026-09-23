import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { recordAuditEvent } from '@/audit/events'
import {
  requireOrganisationAdministrator,
  OrganisationAuthorizationError,
} from '@/organisations/authorization'
import type { OrganisationMembership, Member } from '@/payload-types'

export class OrganisationMembershipError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

type MembershipChangeInput = {
  actor: Member
  membershipID: number
  now?: Date
  organisationID: number
  payload: Payload
}

type MembershipChangeContext = {
  membership: OrganisationMembership
  now: Date
  transaction: { execute: (query: unknown) => Promise<unknown> }
  transactionID: number | string
}

function relationID(value: number | { id: number } | null | undefined): number | null {
  if (typeof value === 'number') return value
  return value?.id ?? null
}

async function requireAdministrator(payload: Payload, actor: Member, organisationID: number): Promise<void> {
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

async function changeMembership<T>(
  input: MembershipChangeInput,
  mutate: (context: MembershipChangeContext) => Promise<T>,
): Promise<T> {
  const { actor, membershipID, now = new Date(), organisationID, payload } = input
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
    const result = await mutate({ membership, now, transaction, transactionID })
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}

export async function disableOrganisationMembership({
  actor,
  membershipID,
  now = new Date(),
  organisationID,
  payload,
}: MembershipChangeInput): Promise<OrganisationMembership> {
  return changeMembership({ actor, membershipID, now, organisationID, payload }, async (context) => {
    await revokeMembershipAccess(payload, context.membership, {}, context.transactionID)
    const disabled = await payload.update({
      collection: 'organisation-memberships',
      data: { status: 'disabled' },
      id: context.membership.id,
      overrideAccess: true,
      req: { payload, transactionID: context.transactionID } as PayloadRequest,
    })
    await recordAuditEvent(payload, {
      action: 'member_disabled',
      actorID: actor.id,
      eventKey: `organisation-membership:${context.membership.id}:disabled:${context.now.toISOString()}`,
      memberID: relationID(context.membership.member) ?? undefined,
      organisationID,
      occurredAt: context.now,
      req: { payload, transactionID: context.transactionID } as PayloadRequest,
    })
    return disabled
  })
}

export async function removeOrganisationMembership({
  actor,
  membershipID,
  now = new Date(),
  organisationID,
  payload,
}: MembershipChangeInput): Promise<void> {
  await changeMembership({ actor, membershipID, now, organisationID, payload }, async (context) => {
    await revokeMembershipAccess(payload, context.membership, { removeMediaAccess: true }, context.transactionID)
    await payload.delete({
      collection: 'organisation-memberships',
      id: context.membership.id,
      overrideAccess: true,
      req: { payload, transactionID: context.transactionID } as PayloadRequest,
    })
    await recordAuditEvent(payload, {
      action: 'member_disabled',
      actorID: actor.id,
      details: { removed: true },
      eventKey: `organisation-membership:${context.membership.id}:removed:${context.now.toISOString()}`,
      memberID: relationID(context.membership.member) ?? undefined,
      organisationID,
      occurredAt: context.now,
      req: { payload, transactionID: context.transactionID } as PayloadRequest,
    })
  })
}
