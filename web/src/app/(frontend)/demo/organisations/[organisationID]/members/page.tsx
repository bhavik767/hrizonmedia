import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { requireOrganisationAdministrator } from '@/organisations/authorization'
import config from '@/payload.config'
import { ensureDemoEnabled } from '@/pilot/demoAvailability'
import { getPilotMember } from '@/pilot/session'

import { MembershipControls } from './MembershipControls'
import { OrganisationInvitationForm } from './OrganisationInvitationForm'

export const metadata: Metadata = { title: 'Organisation Memberships | HrizonMedia Demo' }

export default async function OrganisationMembersPage({
  params,
}: {
  params: Promise<{ organisationID: string }>
}) {
  await ensureDemoEnabled()
  const organisationID = Number((await params).organisationID)
  if (!Number.isSafeInteger(organisationID) || organisationID <= 0) notFound()

  const actor = await getPilotMember()
  if (!actor) redirect(`/demo/sign-in?returnTo=%2Fdemo%2Forganisations%2F${organisationID}%2Fmembers`)
  const payload = await getPayload({ config })
  try {
    await requireOrganisationAdministrator(payload, actor, organisationID)
  } catch {
    redirect('/demo')
  }
  const memberships = await payload.find({
    collection: 'organisation-memberships',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    sort: 'createdAt',
    where: { organisation: { equals: organisationID } },
  })

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Organisation Administrator access
      </p>
      <h1>Organisation Memberships</h1>
      <OrganisationInvitationForm organisationID={organisationID} />
      <h2>Current Memberships</h2>
      <ul>
        {memberships.docs.map((membership) => (
          <li key={membership.id}>
            Membership #{membership.id}: {membership.role} ({membership.status})
            <MembershipControls membershipID={membership.id} organisationID={organisationID} />
          </li>
        ))}
      </ul>
    </main>
  )
}
