'use server'

import { login, logout } from '@payloadcms/next/auth'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { acceptPilotInvitation, createPilotInvitation, InvitationError } from '@/pilot/invitations'
import { safeReturnTo } from '@/pilot/returnTo'
import { getPilotMember } from '@/pilot/session'

export type InviteMemberState = { error?: string; setupUrl?: string }

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') || '')
    .trim()
    .toLowerCase()
  const password = String(formData.get('password') || '')
  const returnTo = safeReturnTo(formData.get('returnTo'))
  let error = 'Email or password is incorrect.'

  try {
    await login({ collection: 'pilot-members', config, email, password })
  } catch (caught) {
    if (caught instanceof Error && /disabled|setting up/i.test(caught.message))
      error = caught.message
    redirect(
      `/demo/sign-in?returnTo=${encodeURIComponent(returnTo)}&error=${encodeURIComponent(error)}`,
    )
  }

  redirect(returnTo)
}

export async function signOut() {
  await logout({ config })
  redirect('/demo/sign-in?signedOut=true')
}

export async function setPilotPassword(formData: FormData) {
  const payload = await getPayload({ config })
  const token = String(formData.get('token') || '')

  try {
    await acceptPilotInvitation({
      password: String(formData.get('password') || ''),
      payload,
      token,
    })
  } catch (caught) {
    const message =
      caught instanceof InvitationError ? caught.message : 'Unable to use this setup link.'
    redirect(`/demo/setup?token=${encodeURIComponent(token)}&error=${encodeURIComponent(message)}`)
  }

  redirect('/demo/sign-in?setup=complete')
}

export async function invitePilotMember(
  _state: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const actor = await getPilotMember()
  if (!actor) return { error: 'Sign in as an operator to invite a Pilot Member.' }

  try {
    const payload = await getPayload({ config })
    const invitation = await createPilotInvitation({
      actor,
      email: String(formData.get('email') || ''),
      name: String(formData.get('name') || ''),
      payload,
      role: formData.get('role') === 'operator' ? 'operator' : 'uploader',
    })
    const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

    return { setupUrl: `${serverURL}/demo/setup?token=${invitation.token}` }
  } catch (caught) {
    return {
      error:
        caught instanceof InvitationError ? caught.message : 'Unable to create the invitation.',
    }
  }
}
