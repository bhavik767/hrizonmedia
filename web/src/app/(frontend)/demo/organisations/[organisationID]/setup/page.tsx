import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { ensureDemoEnabled } from '@/members/demoAvailability'
import { getMember } from '@/members/session'
import { getOrganisationSettingsState } from '@/organisations/settings'
import config from '@/payload.config'

import { SettingsForm } from '../settings/SettingsForm'
import { completeSetup } from '../settings/actions'

export const metadata: Metadata = { title: 'Organisation setup | HrizonMedia Demo' }

export default async function OrganisationSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ organisationID: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await ensureDemoEnabled()
  const { organisationID } = await params
  const id = Number(organisationID)
  const actor = await getMember()
  if (!actor) redirect(`/demo/sign-in?returnTo=${encodeURIComponent(`/demo/organisations/${organisationID}/setup`)}`)
  const state = await getOrganisationSettingsState(await getPayload({ config }), actor, id)
  if (state.settings || !state.initialAdministrator) redirect(`/demo/organisations/${organisationID}/settings`)
  const { error } = await searchParams
  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow"><span aria-hidden="true" /> Organisation setup</p>
      <h1>Configure your Organisation</h1>
      <p>These controls apply to future Upload Sessions. DRM-protected playback is preselected.</p>
      <SettingsForm action={completeSetup.bind(null, organisationID)} settings={{
        defaultRetentionDays: 30, drmDefault: 'protected', drmRequired: false, maximumUploadSizeBytes: 2 * 1024 * 1024 * 1024,
      }} submitLabel="Complete setup" />
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
    </main>
  )
}
