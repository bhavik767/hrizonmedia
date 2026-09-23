import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { ensureDemoEnabled } from '@/members/demoAvailability'
import { getMember } from '@/members/session'
import { getOrganisationSettingsState } from '@/organisations/settings'
import config from '@/payload.config'

import { SettingsForm } from './SettingsForm'
import { clearLogo, saveSettings } from './actions'

export const metadata: Metadata = { title: 'Organisation settings | HrizonMedia Demo' }

export default async function OrganisationSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organisationID: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await ensureDemoEnabled()
  const { organisationID } = await params
  const actor = await getMember()
  if (!actor) redirect(`/demo/sign-in?returnTo=${encodeURIComponent(`/demo/organisations/${organisationID}/settings`)}`)
  const state = await getOrganisationSettingsState(await getPayload({ config }), actor, Number(organisationID))
  if (!state.settings && state.initialAdministrator) redirect(`/demo/organisations/${organisationID}/setup`)
  const { error } = await searchParams
  if (!state.settings) return <main className="demo-page shell"><h1>Organisation setup is pending</h1><p>The initial Organisation Administrator must complete setup first.</p></main>
  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow"><span aria-hidden="true" /> Organisation settings</p>
      <h1>Media policy and branding</h1>
      <p>Changes affect only future Upload Sessions.</p>
      <SettingsForm action={saveSettings.bind(null, organisationID)} settings={state.settings} submitLabel="Save settings" />
      {state.settings.logoDataUrl && <form action={clearLogo.bind(null, organisationID)}><button className="text-button" type="submit">Remove Organisation Logo</button></form>}
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
    </main>
  )
}
