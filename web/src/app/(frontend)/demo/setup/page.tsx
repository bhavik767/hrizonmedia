import type { Metadata } from 'next'

import { ensureDemoEnabled } from '@/pilot/demoAvailability'

import { setPilotPassword } from '../actions'

export const metadata: Metadata = { title: 'Set your password | HrizonMedia Demo' }

export default async function PilotSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>
}) {
  await ensureDemoEnabled()
  const { error, token } = await searchParams

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Invitation setup
      </p>
      <h1>Set your Pilot Member password</h1>
      {token ? (
        <form action={setPilotPassword} className="pilot-form">
          <input name="token" type="hidden" value={token} />
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
            Set password
          </button>
          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <p className="form-message form-message--error" role="alert">
          This setup link is invalid.
        </p>
      )}
    </main>
  )
}
