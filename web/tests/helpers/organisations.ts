import type { Payload } from 'payload'

import type { Member } from '@/payload-types'

export async function createTestOrganisation(
  payload: Payload,
  member: Member,
  role: 'administrator' | 'publisher' | 'viewer' = 'publisher',
): Promise<number> {
  const organisation = await payload.create({
    collection: 'organisations',
    data: { initialAdministrator: member.id, name: `${member.email} Organisation`, status: 'active' },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'organisation-memberships',
    data: { member: member.id, organisation: organisation.id, role, status: 'active' },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'organisation-settings',
    data: {
      defaultRetentionDays: 30,
      drmDefault: 'protected',
      drmRequired: false,
      maximumUploadSizeBytes: 2 * 1024 * 1024 * 1024,
      organisation: organisation.id,
      setupCompletedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  return organisation.id
}

export async function createTestPlatformAdministrator(payload: Payload, member: Member): Promise<void> {
  await payload.create({
    collection: 'platform-administrators',
    data: { member: member.id, status: 'active' },
    overrideAccess: true,
  })
}
