import type { Metadata } from 'next'

import { ensureDemoEnabled } from '@/members/demoAvailability'
import { getMember } from '@/members/session'

import { acceptOrganisationInvitationAction, setOrganisationInvitationPassword } from '../../actions'

export const metadata: Metadata = { title: 'Accept Organisation Invitation | WeCloud Dashboard' }

export default async function AcceptOrganisationInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>
}) {
  await ensureDemoEnabled()
  const { error, token } = await searchParams
  const member = await getMember()

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Organisation Invitation
      </p>
      <h1>Accept Organisation Invitation</h1>
      {token ? (
        member ? (
          <form action={acceptOrganisationInvitationAction} className="member-form">
            <input name="token" type="hidden" value={token} />
            <p>Accept the role assigned by this one-time invitation.</p>
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
          <form action={setOrganisationInvitationPassword} className="member-form">
            <input name="token" type="hidden" value={token} />
            <p>Choose a password to create your Member account and join this Organisation.</p>
            <label htmlFor="new-password">Password</label>
            <input
              autoComplete="new-password"
              id="new-password"
              minLength={8}
              name="password"
              required
              type="password"
            />
            <button className="primary-action" type="submit">
              Create account and join
            </button>
            <p>
              Already have an account?{' '}
              <a href={`/demo/sign-in?returnTo=${encodeURIComponent(`/demo/invitations/accept?token=${token}`)}`}>
                Sign in to accept the invitation
              </a>
            </p>
            {error && (
              <p className="form-message form-message--error" role="alert">
                {error}
              </p>
            )}
          </form>
        )
      ) : (
        <p className="form-message form-message--error" role="alert">
          This Organisation Invitation is invalid.
        </p>
      )}
    </main>
  )
}
