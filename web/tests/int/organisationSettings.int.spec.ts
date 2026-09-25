import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  completeInitialOrganisationSetup,
  removeOrganisationLogo,
  updateOrganisationLogo,
  updateOrganisationSettings,
} from '@/organisations/settings'
import config from '@/payload.config'
import type { Member } from '@/payload-types'

let payload: Payload

async function cleanOrganisationSettings() {
  await payload.delete({ collection: 'organisation-settings', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({
    collection: 'members',
    overrideAccess: true,
    where: { email: { contains: '@organisation-settings.test' } },
  })
}

async function createMember(email: string): Promise<Member> {
  return payload.create({
    collection: 'members',
    data: {
      email,
      name: email,
      password: 'organisation-settings-password',
      status: 'active',
    },
    overrideAccess: true,
  })
}

describe('Organisation Settings', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(cleanOrganisationSettings)
  afterAll(cleanOrganisationSettings)

  it('lets the initial Organisation Administrator complete setup with DRM-protected playback', async () => {
    const initialAdministrator = await createMember(
      'initial-administrator@organisation-settings.test',
    )
    const organisation = await payload.create({
      collection: 'organisations',
      data: { initialAdministrator: initialAdministrator.id, name: 'Example Organisation', status: 'active' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: initialAdministrator.id,
        organisation: organisation.id,
        role: 'administrator',
        status: 'active',
      },
      overrideAccess: true,
    })

    await expect(
      completeInitialOrganisationSetup(payload, initialAdministrator, organisation.id, {
        defaultRetentionDays: 30,
        drmDefault: 'protected',
        drmRequired: false,
        maximumUploadSizeBytes: 1024 * 1024 * 1024,
      }),
    ).resolves.toMatchObject({
      defaultRetentionDays: 30,
      drmDefault: 'protected',
      drmRequired: false,
      maximumUploadSizeBytes: 1024 * 1024 * 1024,
      setupCompletedAt: expect.any(String),
    })
  })

  it('lets Organisation Administrators change the policy used by future Upload Sessions', async () => {
    const initialAdministrator = await createMember(
      'settings-administrator@organisation-settings.test',
    )
    const organisation = await payload.create({
      collection: 'organisations',
      data: { initialAdministrator: initialAdministrator.id, name: 'Policy Organisation', status: 'active' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: initialAdministrator.id,
        organisation: organisation.id,
        role: 'administrator',
        status: 'active',
      },
      overrideAccess: true,
    })
    await completeInitialOrganisationSetup(payload, initialAdministrator, organisation.id, {
      defaultRetentionDays: 30,
      drmDefault: 'protected',
      drmRequired: false,
      maximumUploadSizeBytes: 1024 * 1024 * 1024,
    })

    await expect(
      updateOrganisationSettings(payload, initialAdministrator, organisation.id, {
        defaultRetentionDays: 14,
        drmDefault: 'standard',
        drmRequired: true,
        maximumUploadSizeBytes: 512 * 1024 * 1024,
      }),
    ).resolves.toMatchObject({
      defaultRetentionDays: 14,
      drmDefault: 'standard',
      drmRequired: true,
      maximumUploadSizeBytes: 512 * 1024 * 1024,
    })
  })

  it('accepts a PNG Organisation Logo up to 3 MB and lets an Organisation Administrator remove it', async () => {
    const initialAdministrator = await createMember(
      'logo-administrator@organisation-settings.test',
    )
    const organisation = await payload.create({
      collection: 'organisations',
      data: { initialAdministrator: initialAdministrator.id, name: 'Branded Organisation', status: 'active' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organisation-memberships',
      data: {
        member: initialAdministrator.id,
        organisation: organisation.id,
        role: 'administrator',
        status: 'active',
      },
      overrideAccess: true,
    })
    await completeInitialOrganisationSetup(payload, initialAdministrator, organisation.id, {
      defaultRetentionDays: 30,
      drmDefault: 'protected',
      drmRequired: false,
      maximumUploadSizeBytes: 1024 * 1024 * 1024,
    })

    const logo = await updateOrganisationLogo(payload, initialAdministrator, organisation.id, {
      bytes: new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9aAAAAABJRU5ErkJggg==', 'base64')),
      mimeType: 'image/png',
    })

    expect(logo.logoDataUrl).toMatch(/^data:image\/png;base64,/)
    await expect(
      removeOrganisationLogo(payload, initialAdministrator, organisation.id),
    ).resolves.toMatchObject({ logoDataUrl: null })
  })

  it('rejects SVG and oversized Organisation Logos', async () => {
    const initialAdministrator = await createMember('invalid-logo@organisation-settings.test')
    const organisation = await payload.create({
      collection: 'organisations',
      data: { initialAdministrator: initialAdministrator.id, name: 'Validated Organisation', status: 'active' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organisation-memberships',
      data: { member: initialAdministrator.id, organisation: organisation.id, role: 'administrator', status: 'active' },
      overrideAccess: true,
    })
    await completeInitialOrganisationSetup(payload, initialAdministrator, organisation.id, {
      defaultRetentionDays: 30, drmDefault: 'protected', drmRequired: false, maximumUploadSizeBytes: 1024 * 1024 * 1024,
    })

    await expect(updateOrganisationLogo(payload, initialAdministrator, organisation.id, {
      bytes: new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      mimeType: 'image/svg+xml',
    })).rejects.toMatchObject({ status: 400 })
    await expect(updateOrganisationLogo(payload, initialAdministrator, organisation.id, {
      bytes: new Uint8Array(3 * 1024 * 1024 + 1),
      mimeType: 'image/png',
    })).rejects.toMatchObject({ status: 400 })
  })
})
