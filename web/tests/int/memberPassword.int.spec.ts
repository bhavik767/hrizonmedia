import { pbkdf2Sync } from 'node:crypto'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { changeMemberPassword, MemberPasswordError } from '@/members/password'
import type { Member } from '@/payload-types'

const currentPassword = 'current-password'
const salt = 'test-salt'
const member = {
  id: 42,
  status: 'active',
  salt,
  hash: pbkdf2Sync(currentPassword, salt, 25_000, 512, 'sha256').toString('hex'),
  sessions: [
    { id: 'other-session', expiresAt: '2030-01-01T00:00:00.000Z' },
    { id: 'current-session', expiresAt: '2030-01-01T00:00:00.000Z' },
  ],
} as Member

function fakePayload() {
  const findByID = vi.fn().mockResolvedValue(member)
  const update = vi.fn().mockResolvedValue(member)
  return { payload: { findByID, update } as unknown as Payload, update }
}

describe('Member password changes', () => {
  it('requires the current password and preserves only the current session', async () => {
    const { payload, update } = fakePayload()
    const actor = { ...member, _sid: 'current-session' }

    await expect(changeMemberPassword(payload, actor, 'wrong-password', 'new-password')).rejects.toBeInstanceOf(
      MemberPasswordError,
    )
    expect(update).not.toHaveBeenCalled()

    await changeMemberPassword(payload, actor, currentPassword, 'new-password')
    expect(update).toHaveBeenCalledWith({
      collection: 'members',
      data: { password: 'new-password', sessions: [member.sessions![1]] },
      id: member.id,
      overrideAccess: true,
    })
  })

  it('rejects a stale session and password reuse', async () => {
    const { payload, update } = fakePayload()
    await expect(
      changeMemberPassword(payload, { ...member, _sid: 'expired-session' }, currentPassword, 'new-password'),
    ).rejects.toBeInstanceOf(MemberPasswordError)
    await expect(
      changeMemberPassword(payload, { ...member, _sid: 'current-session' }, currentPassword, currentPassword),
    ).rejects.toBeInstanceOf(MemberPasswordError)
    expect(update).not.toHaveBeenCalled()
  })
})
