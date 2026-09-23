'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getMember } from '@/members/session'
import { guardDemoActionMutation } from '@/media/requestSecurity'
import {
  completeInitialOrganisationSetup,
  OrganisationSettingsError,
  removeOrganisationLogo,
  updateOrganisationLogo,
  updateOrganisationSettings,
  type OrganisationLogoInput,
  type OrganisationSettingsInput,
} from '@/organisations/settings'

function destination(organisationID: number, page: 'settings' | 'setup', error?: string): string {
  const path = `/demo/organisations/${organisationID}/${page}`
  return error ? `${path}?error=${encodeURIComponent(error)}` : path
}

function organisationID(raw: string): number {
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('Invalid Organisation.')
  return parsed
}

function settingsInput(formData: FormData): OrganisationSettingsInput {
  const maximumUploadSizeMegabytes = Number(formData.get('maximumUploadSizeMegabytes'))
  return {
    defaultRetentionDays: Number(formData.get('defaultRetentionDays')),
    drmDefault: formData.get('drmDefault') === 'standard' ? 'standard' : 'protected',
    drmRequired: formData.get('drmRequired') === 'on',
    maximumUploadSizeBytes: maximumUploadSizeMegabytes * 1024 * 1024,
  }
}

async function logoInput(formData: FormData): Promise<OrganisationLogoInput | undefined> {
  const file = formData.get('logo')
  if (!(file instanceof File) || file.size === 0) return undefined
  return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type }
}

async function actionContext() {
  const actor = await getMember()
  if (!actor) throw new OrganisationSettingsError('Sign in as an Organisation Administrator.', 401)
  guardDemoActionMutation(await headers(), actor.id)
  return { actor, payload: await getPayload({ config }) }
}

export async function completeSetup(rawOrganisationID: string, formData: FormData) {
  const id = organisationID(rawOrganisationID)
  try {
    const { actor, payload } = await actionContext()
    await completeInitialOrganisationSetup(payload, actor, id, {
      ...settingsInput(formData),
      logo: await logoInput(formData),
    })
  } catch (error) {
    redirect(destination(id, 'setup', error instanceof Error ? error.message : 'Unable to complete setup.'))
  }
  redirect(destination(id, 'settings'))
}

export async function saveSettings(rawOrganisationID: string, formData: FormData) {
  const id = organisationID(rawOrganisationID)
  try {
    const { actor, payload } = await actionContext()
    await updateOrganisationSettings(payload, actor, id, settingsInput(formData))
    const logo = await logoInput(formData)
    if (logo) await updateOrganisationLogo(payload, actor, id, logo)
  } catch (error) {
    redirect(destination(id, 'settings', error instanceof Error ? error.message : 'Unable to save settings.'))
  }
  redirect(destination(id, 'settings'))
}

export async function clearLogo(rawOrganisationID: string) {
  const id = organisationID(rawOrganisationID)
  try {
    const { actor, payload } = await actionContext()
    await removeOrganisationLogo(payload, actor, id)
  } catch (error) {
    redirect(destination(id, 'settings', error instanceof Error ? error.message : 'Unable to remove logo.'))
  }
  redirect(destination(id, 'settings'))
}
