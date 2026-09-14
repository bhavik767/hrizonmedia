import { createHash, randomBytes } from 'node:crypto'
import type { Payload } from 'payload'

import type { PilotMember } from '@/payload-types'

const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000

type PilotRole = PilotMember['role']

export class InvitationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
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
    throw new InvitationError('Only an active operator can invite Pilot Members.', 403)
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !name.trim() || !['operator', 'uploader'].includes(role)) {
    throw new InvitationError('Name, email, and a valid role are required.', 400)
  }

  const existing = await payload.find({
    collection: 'pilot-members',
    limit: 1,
    overrideAccess: true,
    where: { email: { equals: normalizedEmail } },
  })

  if (existing.docs[0]?.invitationAcceptedAt) {
    throw new InvitationError('A Pilot Member with this email already exists.', 409)
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
    throw new InvitationError('Choose a password with at least 8 characters.', 400)
  }

  const result = await payload.find({
    collection: 'pilot-members',
    limit: 1,
    overrideAccess: true,
    showHiddenFields: true,
    where: { invitationTokenHash: { equals: hashInvitationToken(token) } },
  })
  const member = result.docs[0]

  if (!member || member.invitationAcceptedAt || !member.invitationExpiresAt) {
    throw new InvitationError('This setup link is invalid or has already been used.', 400)
  }

  if (new Date(member.invitationExpiresAt) <= now) {
    throw new InvitationError('This setup link has expired. Ask an operator for a new one.', 410)
  }

  if (member.status !== 'active') {
    throw new InvitationError('This Pilot Member has been disabled.', 403)
  }

  return payload.update({
    collection: 'pilot-members',
    id: member.id,
    data: {
      invitationAcceptedAt: now.toISOString(),
      invitationExpiresAt: null,
      invitationTokenHash: null,
      password,
    },
    overrideAccess: true,
  })
}
