import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { getMember } from '@/members/session'
import { requirePlatformAdministrator } from '@/organisations/authorization'
import config from '@/payload.config'

import { DashboardShell } from '../DashboardShell'
import { OrganisationProvisioningForm } from './OrganisationProvisioningForm'
import { PlatformAdministratorForm } from './PlatformAdministratorForm'

export const metadata: Metadata = { title: 'Organisation administration | WeCloud Dashboard' }

export default async function OrganisationAdministrationPage() {
  const actor = await getMember()
  if (!actor) redirect('/demo/sign-in?returnTo=%2Fdemo%2Forganisations')

  const payload = await getPayload({ config })
  try {
    await requirePlatformAdministrator(payload, actor)
  } catch {
    redirect('/demo')
  }
  const [members, organisations] = await Promise.all([
    payload.find({
      collection: 'members',
      depth: 0,
      limit: 100,
      overrideAccess: true,
      sort: 'name',
      where: { status: { equals: 'active' } },
    }),
    payload.find({
      collection: 'organisations',
      depth: 0,
      limit: 100,
      overrideAccess: true,
      sort: 'name',
      where: { status: { equals: 'active' } },
    }),
  ])

  return (
    <DashboardShell currentPath="/demo/organisations">
      <main className="dashboard-content demo-page" id="main-content">
        <p className="eyebrow">
          <span aria-hidden="true" /> Platform Administrator access
        </p>
        <h1>Organisation administration</h1>
        <p>Create an isolated Organisation and appoint its first Organisation Administrator.</p>
        <OrganisationProvisioningForm
          members={members.docs.map(({ id, name }) => ({ id, name }))}
        />
        <h2>Platform access</h2>
        <p>Platform Administrators can provision Organisations and recover access across them.</p>
        <PlatformAdministratorForm members={members.docs.map(({ id, name }) => ({ id, name }))} />
        <h2>Active Organisations</h2>
        <ul aria-label="Active Organisations">
          {organisations.docs.map((organisation) => (
            <li key={organisation.id}>{organisation.name}</li>
          ))}
        </ul>
      </main>
    </DashboardShell>
  )
}
