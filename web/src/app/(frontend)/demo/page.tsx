import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { ensureDemoEnabled } from '@/members/demoAvailability'
import { getMember } from '@/members/session'
import { getOrganisationSettingsState } from '@/organisations/settings'

import { signOut } from './actions'
import { MediaLibrary } from './MediaLibrary'

export const metadata: Metadata = {
  title: 'Demo | HrizonMedia',
  description: 'Private HrizonMedia secure-video workspace.',
}

export default async function DemoPage() {
  await ensureDemoEnabled()

  const member = await getMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo')
  const payload = await getPayload({ config })
  const organisationMemberships = await payload.find({
    collection: 'organisation-memberships',
    depth: 0,
    limit: 100,
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
    organisationMemberships.docs.length === 1
      ? typeof organisationMemberships.docs[0]!.organisation === 'number'
        ? organisationMemberships.docs[0]!.organisation
        : organisationMemberships.docs[0]!.organisation.id
      : null
  const organisationSettings = organisationID
    ? await getOrganisationSettingsState(payload, member, organisationID)
    : null
  const uploadMemberships = await payload.find({
    collection: 'organisation-memberships',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: {
      and: [
        { member: { equals: member.id } },
        { role: { in: ['administrator', 'publisher'] } },
        { status: { equals: 'active' } },
      ],
    },
  })
  const uploadOrganisations = (
    await Promise.all(
      uploadMemberships.docs.map(async (membership) => {
        const uploadOrganisationID =
          typeof membership.organisation === 'number'
            ? membership.organisation
            : membership.organisation.id
        const [organisation, settings] = await Promise.all([
          payload.findByID({
            collection: 'organisations',
            depth: 0,
            id: uploadOrganisationID,
            overrideAccess: true,
          }),
          payload.find({
            collection: 'organisation-settings',
            depth: 0,
            limit: 1,
            overrideAccess: true,
            where: { organisation: { equals: uploadOrganisationID } },
          }),
        ])
        const policy = settings.docs[0]
        if (!policy || organisation.status !== 'active') return null
        return {
          defaultRetentionDays: policy.defaultRetentionDays,
          drmDefault: policy.drmDefault,
          drmRequired: policy.drmRequired ?? false,
          id: organisation.id,
          maximumUploadSizeBytes: policy.maximumUploadSizeBytes,
          name: organisation.name,
        }
      }),
    )
  ).filter(
    (organisation): organisation is NonNullable<typeof organisation> => organisation !== null,
  )

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Private workspace
      </p>
      <h1>HrizonMedia Demo</h1>
      <p>
        Signed in as {member.name} ({member.email}). The secure-video workspace is ready.
      </p>
      {organisationSettings?.settings?.logoDataUrl && (
        <img
          alt="Organisation Logo"
          className="organisation-logo"
          src={organisationSettings.settings.logoDataUrl}
        />
      )}
      <div className="demo-actions">
        {organisationSettings && (
          <Link
            className="text-link"
            href={`/demo/organisations/${organisationID}/${organisationSettings.settings ? 'settings' : 'setup'}`}
          >
            {organisationSettings.settings
              ? 'Organisation settings'
              : 'Complete Organisation setup'}
          </Link>
        )}
        {organisationMemberships.docs.map((membership) => (
          <Link
            className="text-link"
            href={`/demo/organisations/${membership.organisation}/members`}
            key={membership.id}
          >
            Manage Organisation Memberships
          </Link>
        ))}
        <form action={signOut}>
          <button className="text-button" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <MediaLibrary uploadOrganisations={uploadOrganisations} />
    </main>
  )
}
