import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/audit/events', () => ({ recordAuditEvent: vi.fn() }))

import { recordAuditEvent } from '@/audit/events'
import { authorizeOrganisationMedia } from '@/organisations/authorization'
import type { Member } from '@/payload-types'

describe('Organisation authorization priority', () => {
  beforeEach(() => {
    vi.mocked(recordAuditEvent).mockReset()
  })

  it('uses an explicit administrator Membership before Platform recovery access', async () => {
    const member = { id: 41, status: 'active' } as Member
    const payload = {
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'platform-administrators') {
          return { docs: [{ id: 7, member: member.id, status: 'active' }] }
        }
        if (collection === 'organisation-memberships') {
          return {
            docs: [
              {
                id: 9,
                member: member.id,
                organisation: 2,
                role: 'administrator',
                status: 'active',
              },
            ],
          }
        }
        throw new Error(`Unexpected collection: ${collection}`)
      }),
      findByID: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'members') return member
        if (collection === 'organisations') return { id: 2, status: 'active' }
        throw new Error(`Unexpected collection: ${collection}`)
      }),
    }

    await expect(
      authorizeOrganisationMedia(payload as never, member, {
        operation: 'create',
        organisationID: 2,
      }),
    ).resolves.toEqual({
      membershipID: 9,
      organisationID: 2,
      recoveryAccess: false,
      role: 'administrator',
    })
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })
})
