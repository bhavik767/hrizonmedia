import type { Metadata } from 'next'

import { ensureDemoEnabled } from '@/members/demoAvailability'

import { acceptOrganisationInvitationAction } from '../../actions'

export const metadata: Metadata = { title: 'Accept Organisation Invitation | HrizonMedia Demo' }

export default async function AcceptOrganisationInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>
}) {
  await ensureDemoEnabled()
  const { error, token } = await searchParams

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Organisation Invitation
      </p>
      <h1>Accept Organisation Invitation</h1>
      {token ? (
        <form action={acceptOrganisationInvitationAction} className="member-form">
          <input name="token" type="hidden" value={token} />
          <p>Sign in to accept the role assigned by this one-time invitation.</p>
          <button className="primary-action" type="submit">
            Accept invitation
          </button>
          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <p className="form-message form-message--error" role="alert">
          This Organisation Invitation is invalid.
        </p>
      )}
    </main>
  )
}
