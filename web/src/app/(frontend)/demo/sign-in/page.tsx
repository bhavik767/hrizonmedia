import type { Metadata } from 'next'

import { ensureDemoEnabled } from '@/members/demoAvailability'

import { signIn } from '../actions'

export const metadata: Metadata = {
  title: 'Sign in | WeCloud Dashboard',
}

export default async function DemoSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string; setup?: string; signedOut?: string }>
}) {
  await ensureDemoEnabled()
  const params = await searchParams

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Private workspace
      </p>
      <h1>Sign in to the Dashboard</h1>
      {params.setup === 'complete' && (
        <p className="form-message form-message--success">Password set. You can sign in now.</p>
      )}
      {params.signedOut === 'true' && <p className="form-message">You have signed out.</p>}
      <form action={signIn} className="member-form">
        <input name="returnTo" type="hidden" value={params.returnTo || '/demo'} />
        <label htmlFor="member-email">Email</label>
        <input autoComplete="email" id="member-email" name="email" required type="email" />
        <label htmlFor="member-password">Password</label>
        <input
          autoComplete="current-password"
          id="member-password"
          name="password"
          required
          type="password"
        />
        <button className="primary-action" type="submit">
          Sign in
        </button>
        {params.error && (
          <p className="form-message form-message--error" role="alert">
            {params.error}
          </p>
        )}
      </form>
    </main>
  )
}
