import { createHash, randomBytes } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { PilotMember } from '@/payload-types'

const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000

type PilotRole = PilotMember['role']

export class InvitationError extends Error {
  constructor(message: string) {
    super(message)
  }
}

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createPilotInvitation({
  actor,
  email,
  name,
  now = new Date(),
  payload,
  role,
}: {
  actor: PilotMember
  email: string
  name: string
  now?: Date
  payload: Payload
  role: PilotRole
}) {
  if (actor.status !== 'active' || actor.role !== 'operator') {
    throw new InvitationError('Only an active operator can invite Pilot Members.')
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !name.trim() || !['operator', 'uploader'].includes(role)) {
    throw new InvitationError('Name, email, and a valid role are required.')
  }

  const existing = await payload.find({
    collection: 'pilot-members',
    limit: 1,
    overrideAccess: true,
    showHiddenFields: true,
    where: { email: { equals: normalizedEmail } },
  })

  if (existing.docs[0]?.invitationAcceptedAt) {
    throw new InvitationError('A Pilot Member with this email already exists.')
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS).toISOString()
  const invitationData = {
    email: normalizedEmail,
    invitationAcceptedAt: null,
    invitationExpiresAt: expiresAt,
    invitationTokenHash: hashInvitationToken(token),
    name: name.trim(),
    role,
    status: 'active' as const,
  }

  if (existing.docs[0]) {
    await payload.update({
      collection: 'pilot-members',
      id: existing.docs[0].id,
      data: invitationData,
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'pilot-members',
      data: {
        ...invitationData,
        // Payload auth collections require a password at creation. This random value is
        // never returned; accepting the invitation replaces it with the member's choice.
        password: randomBytes(48).toString('base64url'),
      },
      overrideAccess: true,
    })
  }

  return { expiresAt, token }
}

export async function acceptPilotInvitation({
  now = new Date(),
  password,
  payload,
  token,
}: {
  now?: Date
  password: string
  payload: Payload
  token: string
}): Promise<PilotMember> {
  if (password.length < 8) {
    throw new InvitationError('Choose a password with at least 8 characters.')
  }

  const tokenHash = hashInvitationToken(token)
  const acceptedAt = now.toISOString()
  const transactionID = await payload.db.beginTransaction()
  if (!transactionID) throw new Error('Pilot invitation setup requires database transactions.')

  try {
    const transaction = payload.db.sessions?.[String(transactionID)]?.db as
      { execute: (query: unknown) => Promise<unknown> } | undefined
    if (!transaction) throw new Error('Unable to start the invitation transaction.')

    const result = (await transaction.execute(sql`
      SELECT id, invitation_accepted_at, invitation_expires_at, status
      FROM pilot_members
      WHERE invitation_token_hash = ${tokenHash}
      FOR UPDATE
    `)) as unknown as {
      rows: Array<{
        id: number
        invitation_accepted_at: Date | null
        invitation_expires_at: Date | null
        status: PilotMember['status']
      }>
    }
    const member = result.rows[0]

    if (!member || member.invitation_accepted_at || !member.invitation_expires_at) {
      throw new InvitationError('This setup link is invalid or has already been used.')
    }
    if (new Date(member.invitation_expires_at) <= now) {
      throw new InvitationError('This setup link has expired. Ask an operator for a new one.')
    }
    if (member.status !== 'active') {
      throw new InvitationError('This Pilot Member has been disabled.')
    }

    const accepted = await payload.update({
      collection: 'pilot-members',
      id: member.id,
      data: {
        invitationAcceptedAt: acceptedAt,
        invitationExpiresAt: null,
        invitationTokenHash: null,
        password,
      },
      overrideAccess: true,
      req: { payload, transactionID },
    })
    await payload.db.commitTransaction(transactionID)
    return accepted
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}
