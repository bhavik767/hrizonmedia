import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { requireOrganisationAdministrator } from '@/organisations/authorization'
import config from '@/payload.config'
import { ensureDemoEnabled } from '@/members/demoAvailability'
import { getMember } from '@/members/session'

import { MembershipControls } from './MembershipControls'
import { OrganisationInvitationForm } from './OrganisationInvitationForm'
import { DashboardShell } from '../../../DashboardShell'

export const metadata: Metadata = { title: 'Organisation Memberships | WeCloud Dashboard' }

export default async function OrganisationMembersPage({
  params,
}: {
  params: Promise<{ organisationID: string }>
}) {
  await ensureDemoEnabled()
  const organisationID = Number((await params).organisationID)
  if (!Number.isSafeInteger(organisationID) || organisationID <= 0) notFound()

  const actor = await getMember()
  if (!actor)
    redirect(`/demo/sign-in?returnTo=%2Fdemo%2Forganisations%2F${organisationID}%2Fmembers`)
  const payload = await getPayload({ config })
  try {
    await requireOrganisationAdministrator(payload, actor, organisationID)
  } catch {
    redirect('/demo')
  }
  const memberships = await payload.find({
    collection: 'organisation-memberships',
    depth: 1,
    limit: 100,
    overrideAccess: true,
    sort: 'createdAt',
    where: { organisation: { equals: organisationID } },
  })

  return (
    <DashboardShell currentPath="/demo">
      <main className="dashboard-content demo-page" id="main-content">
        <p className="eyebrow">
          <span aria-hidden="true" /> Organisation Administrator access
        </p>
        <h1>Organisation Memberships</h1>
        <h2>Invite a member</h2>
        <p>
          Create a one-time invitation for a new Organisation Administrator, Publisher, or Viewer.
        </p>
        <OrganisationInvitationForm organisationID={organisationID} />
        <h2>Current Memberships</h2>
        <ul>
          {memberships.docs.map((membership) => (
            <li key={membership.id}>
              {typeof membership.member === 'number'
                ? `Member #${membership.member}`
                : `${membership.member.name} (${membership.member.email})`}{' '}
              — {membership.role} ({membership.status})
              <MembershipControls membershipID={membership.id} organisationID={organisationID} />
            </li>
          ))}
        </ul>
      </main>
    </DashboardShell>
  )
}
