import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { ensureDemoEnabled } from '@/members/demoAvailability'
import { getMember } from '@/members/session'
import { getOrganisationSettingsState } from '@/organisations/settings'
import config from '@/payload.config'

export interface DashboardData {
  administratorOrganisationID: number | null
  libraryOrganisations: { id: number; name: string }[]
  member: { email: string; name: string }
  organisationLogoDataURL: string | null
  organisationSettingsLinks: { href: string; label: string }[]
  platformAdministration: boolean
  uploadOrganisations: {
    defaultRetentionDays: number
    drmDefault: 'protected' | 'standard'
    drmRequired: boolean
    id: number
    maximumUploadSizeBytes: number
    name: string
  }[]
}

function organisationID(membership: { organisation: number | { id: number } }): number {
  return typeof membership.organisation === 'number'
    ? membership.organisation
    : membership.organisation.id
}

export async function getDashboardData(): Promise<DashboardData> {
  await ensureDemoEnabled()

  const member = await getMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo')

  const payload = await getPayload({ config })
  const [administratorMemberships, uploadMemberships, libraryMemberships, platformAdministrators] =
    await Promise.all([
      payload.find({
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
      }),
      payload.find({
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
      }),
      payload.find({
        collection: 'organisation-memberships',
        depth: 0,
        limit: 100,
        overrideAccess: true,
        where: { and: [{ member: { equals: member.id } }, { status: { equals: 'active' } }] },
      }),
      payload.find({
        collection: 'platform-administrators',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: {
          and: [{ member: { equals: member.id } }, { status: { equals: 'active' } }],
        },
      }),
    ])
  const administratorOrganisationID = administratorMemberships.docs[0]
    ? organisationID(administratorMemberships.docs[0])
    : null
  const organisationSettings = administratorOrganisationID
    ? await getOrganisationSettingsState(payload, member, administratorOrganisationID)
    : null
  const libraryOrganisations = (
    await Promise.all(
      libraryMemberships.docs.map(async (membership) => {
        const id = organisationID(membership)
        const organisation = await payload.findByID({
          collection: 'organisations',
          depth: 0,
          id,
          overrideAccess: true,
        })
        return organisation.status === 'active'
          ? { id: organisation.id, name: organisation.name }
          : null
      }),
    )
  ).filter((organisation): organisation is { id: number; name: string } => organisation !== null)
  const uploadOrganisations = (
    await Promise.all(
      uploadMemberships.docs.map(async (membership) => {
        const id = organisationID(membership)
        const [organisation, settings] = await Promise.all([
          payload.findByID({ collection: 'organisations', depth: 0, id, overrideAccess: true }),
          payload.find({
            collection: 'organisation-settings',
            depth: 0,
            limit: 1,
            overrideAccess: true,
            where: { organisation: { equals: id } },
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
    (organisation): organisation is DashboardData['uploadOrganisations'][number] =>
      organisation !== null,
  )

  return {
    administratorOrganisationID,
    libraryOrganisations,
    member: { email: member.email, name: member.name },
    organisationLogoDataURL: organisationSettings?.settings?.logoDataUrl ?? null,
    platformAdministration: Boolean(platformAdministrators.docs[0]),
    organisationSettingsLinks: administratorMemberships.docs.map((membership) => {
      const id = organisationID(membership)
      return {
        href: `/demo/organisations/${id}/${id === administratorOrganisationID && organisationSettings?.settings ? 'settings' : 'setup'}`,
        label:
          id === administratorOrganisationID && organisationSettings?.settings
            ? 'Organisation settings'
            : 'Complete Organisation setup',
      }
    }),
    uploadOrganisations,
  }
}
