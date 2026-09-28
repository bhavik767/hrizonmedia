'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { getMember } from '@/members/session'
import { changeMemberPassword, MemberPasswordError } from '@/members/password'
import { guardDemoActionMutation } from '@/media/requestSecurity'
import config from '@/payload.config'

export type ChangePasswordState = { error?: string; success?: string }

export async function changePasswordAction(
  _state: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const actor = await getMember()
  if (!actor) return { error: 'Your session has expired. Sign in again.' }

  const currentPassword = formData.get('currentPassword')
  const newPassword = formData.get('newPassword')
  const confirmPassword = formData.get('confirmPassword')
  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    typeof confirmPassword !== 'string'
  ) {
    return { error: 'Complete all password fields.' }
  }
  if (newPassword !== confirmPassword) return { error: 'New passwords do not match.' }

  try {
    guardDemoActionMutation(await headers(), actor.id, '/demo/account/password')
    await changeMemberPassword(await getPayload({ config }), actor, currentPassword, newPassword)
    return { success: 'Password changed. Other sessions have been signed out.' }
  } catch (error) {
    if (error instanceof Response && error.status === 429) {
      return { error: 'Too many attempts. Try again in a minute.' }
    }
    // Temporary diagnostic: never log form values, which include passwords.
    console.error('[member-password-change-failed]', {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : typeof error,
      memberID: actor.id,
    })
    return {
      error: error instanceof MemberPasswordError ? error.message : 'Unable to change password.',
    }
  }
}
