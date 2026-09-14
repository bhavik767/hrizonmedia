import { getPayload } from 'payload'

import config from '../../src/payload.config.js'

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

export async function seedPilotOperator(): Promise<void> {
  const payload = await getPayload({ config })
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

export async function cleanupPilotMembers(): Promise<void> {
  const payload = await getPayload({ config })
  await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
}
