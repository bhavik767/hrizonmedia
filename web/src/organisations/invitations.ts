import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { recordAuditEvent } from '@/audit/events'
import {
  requireOrganisationAdministrator as requireAuthorisedOrganisationAdministrator,
  OrganisationAuthorizationError,
} from '@/organisations/authorization'
import type { OrganisationMembership, PilotMember } from '@/payload-types'

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const invitationRoles = ['administrator', 'publisher', 'viewer'] as const

type OrganisationRole = (typeof invitationRoles)[number]

export class OrganisationInvitationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function validRole(role: string): role is OrganisationRole {
  return invitationRoles.includes(role as OrganisationRole)
}

async function requireOrganisationAdministrator(
  payload: Payload,
  actor: PilotMember,
  organisationID: number,
): Promise<void> {
  try {
    await requireAuthorisedOrganisationAdministrator(payload, actor, organisationID)
  } catch (error) {
    if (error instanceof OrganisationAuthorizationError) {
      throw new OrganisationInvitationError(error.message, error.status)
    }
    throw error
  }
}

async function requireActiveAuthenticatedMember(payload: Payload, actor: PilotMember): Promise<void> {
  const current = await payload.findByID({
    collection: 'pilot-members',
    depth: 0,
    id: actor.id,
    overrideAccess: true,
    showHiddenFields: true,
  })
  if (current.status !== 'active' || !current.invitationAcceptedAt) {
    throw new OrganisationInvitationError('Active authentication is required.', 401)
  }
}

export async function createOrganisationInvitation({
  actor,
  now = new Date(),
  organisationID,
  payload,
  role,
}: {
  actor: PilotMember
  now?: Date
  organisationID: number
  payload: Payload
  role: OrganisationRole
}): Promise<{ expiresAt: string; token: string }> {
  if (!Number.isSafeInteger(organisationID) || organisationID <= 0 || !validRole(role)) {
    throw new OrganisationInvitationError('An Organisation and valid role are required.', 400)
  }
  await requireOrganisationAdministrator(payload, actor, organisationID)

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS).toISOString()
  const invitation = await payload.create({
    collection: 'organisation-invitations',
    data: { organisation: organisationID, role, tokenHash: hashInvitationToken(token), expiresAt },
    overrideAccess: true,
  })
  await recordAuditEvent(payload, {
    action: 'invitation_created',
    actorID: actor.id,
    details: { invitationID: invitation.id, role },
    eventKey: `organisation-invitation:${invitation.id}:created`,
    organisationID,
    occurredAt: now,
  })
  return { expiresAt, token }
}

export async function acceptOrganisationInvitation({
  actor,
  now = new Date(),
  payload,
  token,
}: {
  actor: PilotMember
  now?: Date
  payload: Payload
  token: string
}): Promise<OrganisationMembership> {
  await requireActiveAuthenticatedMember(payload, actor)

  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new Error('Organisation invitation acceptance requires database transactions.')

  try {
    const transaction = payload.db.sessions?.[String(transactionID)]?.db as
      | { execute: (query: unknown) => Promise<unknown> }
      | undefined
    if (!transaction) throw new Error('Unable to start the invitation transaction.')

    const result = (await transaction.execute(sql`
      SELECT id, organisation_id, role, expires_at, accepted_at
      FROM organisation_invitations
      WHERE token_hash = ${hashInvitationToken(token)}
      FOR UPDATE
    `)) as unknown as {
      rows: Array<{
        accepted_at: Date | null
        expires_at: Date | null
        id: number
        organisation_id: number
        role: OrganisationRole
      }>
    }
    const invitation = result.rows[0]
    if (!invitation || invitation.accepted_at || !invitation.expires_at) {
      throw new OrganisationInvitationError('This Organisation Invitation is invalid or has already been used.', 404)
    }
    if (new Date(invitation.expires_at) <= now) {
      throw new OrganisationInvitationError('This Organisation Invitation has expired.', 410)
    }

    const existingMembership = await payload.find({
      collection: 'organisation-memberships',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req: { payload, transactionID },
      where: {
        and: [
          { member: { equals: actor.id } },
          { organisation: { equals: invitation.organisation_id } },
        ],
      },
    })
    const acceptedAt = now.toISOString()
    const req = { payload, transactionID } as PayloadRequest
    const existing = existingMembership.docs[0]
    const membership = existing
      ? await payload.update({
          collection: 'organisation-memberships',
          data: { role: invitation.role, status: 'active' },
          id: existing.id,
          overrideAccess: true,
          req,
        })
      : await payload.create({
          collection: 'organisation-memberships',
          data: {
            member: actor.id,
            organisation: invitation.organisation_id,
            role: invitation.role,
            status: 'active',
          },
          overrideAccess: true,
          req,
        })
    await payload.update({
      collection: 'organisation-invitations',
      data: { acceptedAt, acceptedBy: actor.id },
      id: invitation.id,
      overrideAccess: true,
      req,
    })
    await recordAuditEvent(payload, {
      action: 'invitation_accepted',
      actorID: actor.id,
      details: { invitationID: invitation.id, role: invitation.role },
      eventKey: `organisation-invitation:${invitation.id}:accepted`,
      memberID: actor.id,
      organisationID: invitation.organisation_id,
      occurredAt: now,
      req,
    })
    await payload.db.commitTransaction(transactionID)
    return membership
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}
