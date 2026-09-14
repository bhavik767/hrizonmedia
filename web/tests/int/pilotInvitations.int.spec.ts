import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { acceptPilotInvitation, createPilotInvitation } from '@/pilot/invitations'
import type { PilotMember } from '@/payload-types'

let payload: Payload

const operatorData = {
  email: 'operator@pilot.test',
  invitationAcceptedAt: new Date('2026-09-14T00:00:00.000Z').toISOString(),
  name: 'Test Operator',
  password: 'operator-password',
  role: 'operator' as const,
  status: 'active' as const,
}

describe('Pilot Member invitations', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
  })

  afterAll(async () => {
    await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
  })

  async function createOperator(): Promise<PilotMember> {
    return payload.create({
      collection: 'pilot-members',
      data: operatorData,
      overrideAccess: true,
    })
  }

  it('stores a hash instead of the setup token and expires it after 24 hours', async () => {
    const actor = await createOperator()
    const now = new Date('2026-09-14T10:00:00.000Z')
    const invitation = await createPilotInvitation({
      actor,
      email: ' New.Member@Example.com ',
      name: 'New Member',
      now,
      payload,
      role: 'uploader',
    })

    const invited = await payload.find({
      collection: 'pilot-members',
      limit: 1,
      overrideAccess: true,
      showHiddenFields: true,
      where: { email: { equals: 'new.member@example.com' } },
    })

    expect(invited.docs[0]?.invitationTokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(invited.docs[0]?.invitationTokenHash).not.toBe(invitation.token)
    expect(invitation.expiresAt).toBe('2026-09-15T10:00:00.000Z')
  })

  it('accepts a valid setup link once and rejects replay', async () => {
    const actor = await createOperator()
    const invitation = await createPilotInvitation({
      actor,
      email: 'member@example.com',
      name: 'Pilot Member',
      now: new Date('2026-09-14T10:00:00.000Z'),
      payload,
      role: 'uploader',
    })

    await acceptPilotInvitation({
      now: new Date('2026-09-14T11:00:00.000Z'),
      password: 'member-password',
      payload,
      token: invitation.token,
    })

    await expect(
      acceptPilotInvitation({
        now: new Date('2026-09-14T11:01:00.000Z'),
        password: 'another-password',
        payload,
        token: invitation.token,
      }),
    ).rejects.toThrow('invalid or has already been used')
  })

  it('allows only one concurrent submission to consume a setup link', async () => {
    const actor = await createOperator()
    const invitation = await createPilotInvitation({
      actor,
      email: 'concurrent@example.com',
      name: 'Concurrent Member',
      now: new Date('2026-09-14T10:00:00.000Z'),
      payload,
      role: 'uploader',
    })

    const attempts = await Promise.allSettled([
      acceptPilotInvitation({
        now: new Date('2026-09-14T11:00:00.000Z'),
        password: 'first-password',
        payload,
        token: invitation.token,
      }),
      acceptPilotInvitation({
        now: new Date('2026-09-14T11:00:00.000Z'),
        password: 'second-password',
        payload,
        token: invitation.token,
      }),
    ])

    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(1)
  })

  it('rejects expired setup links', async () => {
    const actor = await createOperator()
    const invitation = await createPilotInvitation({
      actor,
      email: 'expired@example.com',
      name: 'Expired Member',
      now: new Date('2026-09-14T10:00:00.000Z'),
      payload,
      role: 'uploader',
    })

    await expect(
      acceptPilotInvitation({
        now: new Date('2026-09-15T10:00:00.001Z'),
        password: 'member-password',
        payload,
        token: invitation.token,
      }),
    ).rejects.toThrow('expired')
  })

  it('rejects login for a disabled Pilot Member', async () => {
    await payload.create({
      collection: 'pilot-members',
      data: { ...operatorData, email: 'disabled@example.com', status: 'disabled' },
      overrideAccess: true,
    })

    await expect(
      payload.login({
        collection: 'pilot-members',
        data: { email: 'disabled@example.com', password: operatorData.password },
      }),
    ).rejects.toThrow('disabled')
  })
})
