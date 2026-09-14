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
  await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })

  for (const member of [testInvitee, testSecondUploader]) {
    await payload.create({
      collection: 'pilot-members',
      data: {
        ...member,
        invitationAcceptedAt: new Date().toISOString(),
        role: 'uploader',
        status: 'active',
      },
      overrideAccess: true,
    })
  }
}

export async function cleanupPilotMembers(): Promise<void> {
  const payload = await getPayload({ config })
  await cleanMediaRecords(payload)
  await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
}
