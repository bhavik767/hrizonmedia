import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { cleanMediaRecords } from './cleanMediaRecords.js'

export const testOperator = {
  email: 'operator@pilot.test',
  name: 'Pilot Operator',
  password: 'operator-password',
}

export const testInvitee = {
  email: 'uploader@pilot.test',
  name: 'Pilot Uploader',
  password: 'uploader-password',
}

export const testSecondUploader = {
  email: 'second-uploader@pilot.test',
  name: 'Second Pilot Uploader',
  password: 'second-uploader-password',
}

export async function seedPilotOperator(): Promise<void> {
  const payload = await getPayload({ config })
  await cleanMediaRecords(payload)
  await payload.delete({ collection: 'organisation-settings', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
  await payload.create({
    collection: 'pilot-members',
    data: {
      ...testOperator,
      invitationAcceptedAt: new Date().toISOString(),
      role: 'operator',
      status: 'active',
    },
    overrideAccess: true,
  })
}

export async function seedPilotUploaders(): Promise<void> {
  const payload = await getPayload({ config })
  await cleanMediaRecords(payload)
  await payload.delete({ collection: 'organisation-settings', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })

  for (const member of [testInvitee, testSecondUploader]) {
    const publisher = await payload.create({
      collection: 'pilot-members',
      data: {
        ...member,
        invitationAcceptedAt: new Date().toISOString(),
        role: 'uploader',
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

export async function cleanupPilotMembers(): Promise<void> {
  const payload = await getPayload({ config })
  await cleanMediaRecords(payload)
  await payload.delete({ collection: 'organisation-settings', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
}
