'use server'

import { login, logout } from '@payloadcms/next/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  acceptOrganisationInvitation,
  createOrganisationInvitation,
  OrganisationInvitationError,
} from '@/organisations/invitations'
import {
  disableOrganisationMembership,
  OrganisationMembershipError,
  removeOrganisationMembership,
} from '@/organisations/memberships'
import {
  grantMediaAccess,
  OrganisationMediaAccessError,
  revokeMediaAccess,
} from '@/organisations/media-access'
import { parseMediaAssetId } from '@/media/identifiers'
import { safeReturnTo } from '@/members/returnTo'
import { getMember } from '@/members/session'
import { guardDemoActionMutation } from '@/media/requestSecurity'

export type OrganisationInvitationState = { error?: string; invitationURL?: string }
export type OrganisationMembershipState = { error?: string; success?: string }
export type MediaAccessState = { error?: string; success?: string }

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') || '')
    .trim()
    .toLowerCase()
  const password = String(formData.get('password') || '')
  const returnTo = safeReturnTo(formData.get('returnTo'))
  let error = 'Email or password is incorrect.'

  try {
    guardDemoActionMutation(await headers())
    await login({ collection: 'members', config, email, password })
  } catch (caught) {
    if (caught instanceof Response && caught.status === 429)
      error = 'Too many sign-in attempts. Try again shortly.'
    if (caught instanceof Error && /disabled|setting up/i.test(caught.message))
      error = caught.message
    redirect(
      `/demo/sign-in?returnTo=${encodeURIComponent(returnTo)}&error=${encodeURIComponent(error)}`,
    )
  }

  redirect(returnTo)
}

export async function signOut() {
  guardDemoActionMutation(await headers(), (await getMember())?.id)
  await logout({ config })
  redirect('/demo/sign-in?signedOut=true')
}

function organisationRole(
  value: FormDataEntryValue | null,
): 'administrator' | 'publisher' | 'viewer' | null {
  if (value === 'administrator' || value === 'publisher' || value === 'viewer') return value
  return null
}

function positiveInteger(value: FormDataEntryValue | null): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export async function inviteOrganisationMember(
  _state: OrganisationInvitationState,
  formData: FormData,
): Promise<OrganisationInvitationState> {
  const actor = await getMember()
  if (!actor) return { error: 'Sign in to create an Organisation Invitation.' }

  const organisationID = positiveInteger(formData.get('organisationID'))
  const role = organisationRole(formData.get('role'))
  if (!organisationID || !role) return { error: 'Choose a valid Organisation role.' }

  try {
    guardDemoActionMutation(await headers(), actor.id)
    const payload = await getPayload({ config })
    const invitation = await createOrganisationInvitation({
      actor,
      organisationID,
      payload,
      role,
    })
    const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    return {
      invitationURL: `${serverURL}/demo/invitations/accept?token=${encodeURIComponent(invitation.token)}`,
    }
  } catch (caught) {
    return {
      error:
        caught instanceof OrganisationInvitationError
          ? caught.message
          : 'Unable to create the Organisation Invitation.',
    }
  }
}

export async function acceptOrganisationInvitationAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') || '')
  const returnTo = `/demo/invitations/accept?token=${encodeURIComponent(token)}`
  const actor = await getMember()
  if (!actor) redirect(`/demo/sign-in?returnTo=${encodeURIComponent(returnTo)}`)

  try {
    guardDemoActionMutation(await headers(), actor.id)
    await acceptOrganisationInvitation({
      actor,
      payload: await getPayload({ config }),
      token,
    })
  } catch (caught) {
    const message =
      caught instanceof OrganisationInvitationError
        ? caught.message
        : 'Unable to accept the Organisation Invitation.'
    redirect(`${returnTo}&error=${encodeURIComponent(message)}`)
  }

  redirect('/demo?organisationInvitation=accepted')
}

async function changeOrganisationMembership(
  formData: FormData,
  mutation: typeof disableOrganisationMembership | typeof removeOrganisationMembership,
): Promise<OrganisationMembershipState> {
  const actor = await getMember()
  if (!actor) return { error: 'Sign in to manage Organisation Memberships.' }

  const organisationID = positiveInteger(formData.get('organisationID'))
  const membershipID = positiveInteger(formData.get('membershipID'))
  if (!organisationID || !membershipID) return { error: 'Organisation Membership not found.' }

  try {
    guardDemoActionMutation(await headers(), actor.id)
    await mutation({
      actor,
      membershipID,
      organisationID,
      payload: await getPayload({ config }),
    })
    revalidatePath(`/demo/organisations/${organisationID}/members`)
    return { success: 'Organisation Membership updated.' }
  } catch (caught) {
    return {
      error:
        caught instanceof OrganisationMembershipError
          ? caught.message
          : 'Unable to update the Organisation Membership.',
    }
  }
}

export async function disableOrganisationMember(
  _state: OrganisationMembershipState,
  formData: FormData,
): Promise<OrganisationMembershipState> {
  return changeOrganisationMembership(formData, disableOrganisationMembership)
}

export async function removeOrganisationMember(
  _state: OrganisationMembershipState,
  formData: FormData,
): Promise<OrganisationMembershipState> {
  return changeOrganisationMembership(formData, removeOrganisationMembership)
}

async function changeMediaAccess(
  formData: FormData,
  mutation: typeof grantMediaAccess | typeof revokeMediaAccess,
): Promise<MediaAccessState> {
  const actor = await getMember()
  if (!actor) return { error: 'Sign in to manage Media Access.' }

  const mediaAssetId = parseMediaAssetId(String(formData.get('mediaAssetId') || ''))
  const membershipID = positiveInteger(formData.get('membershipID'))
  if (!mediaAssetId || !membershipID) return { error: 'Media Access target not found.' }

  try {
    guardDemoActionMutation(await headers(), actor.id)
    const payload = await getPayload({ config })
    const assets = await payload.find({
      collection: 'media-assets',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { mediaAssetId: { equals: mediaAssetId } },
    })
    const asset = assets.docs[0]
    if (!asset) return { error: 'Media Asset not found.' }
    await mutation({ actor, assetID: asset.id, membershipID, payload })
    revalidatePath(`/demo/assets/${mediaAssetId}`)
    revalidatePath('/demo')
    return { success: 'Media Access updated.' }
  } catch (caught) {
    return {
      error:
        caught instanceof OrganisationMediaAccessError
          ? caught.message
          : 'Unable to update Media Access.',
    }
  }
}

export async function grantViewerMediaAccess(
  _state: MediaAccessState,
  formData: FormData,
): Promise<MediaAccessState> {
  return changeMediaAccess(formData, grantMediaAccess)
}

export async function revokeViewerMediaAccess(
  _state: MediaAccessState,
  formData: FormData,
): Promise<MediaAccessState> {
  return changeMediaAccess(formData, revokeMediaAccess)
}
