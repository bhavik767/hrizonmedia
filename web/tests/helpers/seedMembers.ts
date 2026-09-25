import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { cleanMediaRecords } from './cleanMediaRecords.js'

export const testOperator = {
  email: 'operator@members.test',
  name: 'Platform Administrator',
  password: 'operator-password',
}

export const testInvitee = {
  email: 'uploader@members.test',
  name: 'Organisation Publisher',
  password: 'uploader-password',
}

export const testSecondUploader = {
  email: 'second-uploader@members.test',
  name: 'Second Organisation Publisher',
  password: 'second-uploader-password',
}

export async function seedOperator(): Promise<void> {
  const payload = await getPayload({ config })
  await cleanMediaRecords(payload)
  await payload.delete({ collection: 'organisation-settings', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'platform-administrators', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'members', overrideAccess: true, where: {} })
  const platformAdministrator = await payload.create({
    collection: 'members',
    data: {
      ...testOperator,
      status: 'active',
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'platform-administrators',
    data: { member: platformAdministrator.id, status: 'active' },
    overrideAccess: true,
  })
}

export async function seedUploaders(): Promise<void> {
  const payload = await getPayload({ config })
  await cleanMediaRecords(payload)
  await payload.delete({ collection: 'organisation-settings', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'platform-administrators', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'members', overrideAccess: true, where: {} })

  for (const member of [testInvitee, testSecondUploader]) {
    const publisher = await payload.create({
      collection: 'members',
      data: {
        ...member,
        status: 'active',
      },
      overrideAccess: true,
    })
    const organisation = await payload.create({
      collection: 'organisations',
      data: {
        initialAdministrator: publisher.id,
        name: `${member.name} Organisation`,
        status: 'active',
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: publisher.id,
        organisation: organisation.id,
        role: 'publisher',
        status: 'active',
      },
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
  }
}

export async function cleanupMembers(): Promise<void> {
  const payload = await getPayload({ config })
  await cleanMediaRecords(payload)
  await payload.delete({ collection: 'organisation-settings', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'platform-administrators', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'members', overrideAccess: true, where: {} })
}
