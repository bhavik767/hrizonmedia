import 'server-only'

import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'

type BootstrapEnvironment = {
  RAILWAY_ENVIRONMENT_NAME?: string
  STAGING_PLATFORM_ADMIN_EMAIL?: string
  STAGING_PLATFORM_ADMIN_NAME?: string
  STAGING_PLATFORM_ADMIN_PASSWORD?: string
}

function readBootstrapConfiguration(environment: BootstrapEnvironment) {
  if (environment.RAILWAY_ENVIRONMENT_NAME !== 'staging') return null

  const email = environment.STAGING_PLATFORM_ADMIN_EMAIL?.trim()
  const password = environment.STAGING_PLATFORM_ADMIN_PASSWORD
  if (!email && !password) return null
  if (!email || !password) {
    throw new Error('Staging Platform Administrator bootstrap requires both email and password.')
  }
  if (password.length < 12) {
    throw new Error(
      'Staging Platform Administrator bootstrap password must be at least 12 characters.',
    )
  }

  return {
    email,
    name: environment.STAGING_PLATFORM_ADMIN_NAME?.trim() || 'Staging Platform Administrator',
    password,
  }
}

async function upsertPlatformAdministrator(
  payload: Payload,
  configuration: NonNullable<ReturnType<typeof readBootstrapConfiguration>>,
) {
  const existingMembers = await payload.find({
    collection: 'members',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { email: { equals: configuration.email } },
  })
  const existingMember = existingMembers.docs[0]
  const member = existingMember
    ? await payload.update({
        collection: 'members',
        data: {
          name: configuration.name,
          password: configuration.password,
          status: 'active',
        },
        id: existingMember.id,
        overrideAccess: true,
      })
    : await payload.create({
        collection: 'members',
        data: {
          email: configuration.email,
          name: configuration.name,
          password: configuration.password,
          status: 'active',
        },
        overrideAccess: true,
      })

  const existingAdministrators = await payload.find({
    collection: 'platform-administrators',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { member: { equals: member.id } },
  })
  const existingAdministrator = existingAdministrators.docs[0]
  if (existingAdministrator) {
    await payload.update({
      collection: 'platform-administrators',
      data: { status: 'active' },
      id: existingAdministrator.id,
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'platform-administrators',
      data: { member: member.id, status: 'active' },
      overrideAccess: true,
    })
  }

  return member
}

let bootstrapping: Promise<void> | undefined

export async function bootstrapStagingPlatformAdministrator(
  environment: BootstrapEnvironment = process.env,
): Promise<void> {
  const configuration = readBootstrapConfiguration(environment)
  if (!configuration) return

  bootstrapping ??= (async () => {
    const payload = await getPayload({ config })
    await upsertPlatformAdministrator(payload, configuration)
    payload.logger.info({
      message: `Staging Platform Administrator bootstrap completed for ${configuration.email}.`,
    })
  })()
  return bootstrapping
}
