import 'server-only'

import { pbkdf2 as pbkdf2Callback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Payload } from 'payload'

import type { Member } from '@/payload-types'

const pbkdf2 = promisify(pbkdf2Callback)

export class MemberPasswordError extends Error {}

async function matchesPassword(password: string, member: Member): Promise<boolean> {
  if (!member.salt || !member.hash) return false
  const expected = Buffer.from(member.hash, 'hex')
  if (expected.length !== 512) return false
  const actual = await pbkdf2(password, member.salt, 25_000, 512, 'sha256')
  return timingSafeEqual(actual, expected)
}

export async function changeMemberPassword(
  payload: Payload,
  actor: Member & { _sid?: string },
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!currentPassword || newPassword.length < 8) {
    throw new MemberPasswordError('Enter your current password and a new password of at least 8 characters.')
  }
  if (currentPassword === newPassword) {
    throw new MemberPasswordError('Choose a different password.')
  }

  const member = await payload.findByID({
    collection: 'members',
    depth: 0,
    id: actor.id,
    overrideAccess: true,
    showHiddenFields: true,
  })
  if (member.status !== 'active' || !actor._sid) {
    throw new MemberPasswordError('Your session has expired. Sign in again.')
  }
  const currentSession = member.sessions?.find(({ id }) => id === actor._sid)
  if (!currentSession) {
    throw new MemberPasswordError('Your session has expired. Sign in again.')
  }
  if (!(await matchesPassword(currentPassword, member))) {
    throw new MemberPasswordError('Current password is incorrect.')
  }

  await payload.update({
    collection: 'members',
    data: { password: newPassword, sessions: [currentSession] },
    id: actor.id,
    overrideAccess: true,
  })
}
