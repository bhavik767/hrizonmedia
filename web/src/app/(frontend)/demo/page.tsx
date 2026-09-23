import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { ensureDemoEnabled } from '@/pilot/demoAvailability'
import { getPilotMember } from '@/pilot/session'
import { getOrganisationSettingsState } from '@/organisations/settings'
import config from '@/payload.config'

import { signOut } from './actions'
import { MediaLibrary } from './MediaLibrary'

export const metadata: Metadata = {
  title: 'Demo | HrizonMedia',
  description: 'Private HrizonMedia secure-video pilot Demo.',
}

export default async function DemoPage() {
  await ensureDemoEnabled()

  const member = await getPilotMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo')
  const memberships = await (await getPayload({ config })).find({
    collection: 'organisation-memberships',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    where: {
      and: [
        { member: { equals: member.id } },
        { role: { equals: 'administrator' } },
        { status: { equals: 'active' } },
      ],
    },
  })
  const organisationID =
    memberships.docs.length === 1
      ? typeof memberships.docs[0]!.organisation === 'number'
        ? memberships.docs[0]!.organisation
        : memberships.docs[0]!.organisation.id
      : null
  const organisationSettings = organisationID
    ? await getOrganisationSettingsState(await getPayload({ config }), member, organisationID)
    : null

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Private pilot
      </p>
      <h1>HrizonMedia Demo</h1>
      <p>
        Signed in as {member.name} ({member.email}). The secure-video workspace is ready.
      </p>
      <div className="demo-actions">
        {member.role === 'operator' && (
          <>
            <Link className="text-link" href="/demo/operations">
              Operator oversight
            </Link>
            <Link className="text-link" href="/demo/members">
              Invite Pilot Members
            </Link>
          </>
        )}
        {organisationSettings && (
          <Link
            className="text-link"
            href={`/demo/organisations/${organisationID}/${organisationSettings.settings ? 'settings' : 'setup'}`}
          >
            {organisationSettings.settings ? 'Organisation settings' : 'Complete Organisation setup'}
          </Link>
        )}
        <form action={signOut}>
          <button className="text-button" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <MediaLibrary canUpload={member.role === 'uploader'} />
    </main>
  )
}
