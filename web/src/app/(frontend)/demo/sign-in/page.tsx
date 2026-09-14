import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import { signIn } from '../actions'

export const metadata: Metadata = {
  title: 'Sign in | HrizonMedia Demo',
}

export default async function PilotSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string; setup?: string; signedOut?: string }>
}) {
  await connection()

  if (process.env.HRIZONMEDIA_DEMO_ENABLED !== 'true') notFound()
  const params = await searchParams

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Private pilot
      </p>
      <h1>Sign in to the Demo</h1>
      {params.setup === 'complete' && (
        <p className="form-message form-message--success">Password set. You can sign in now.</p>
      )}
      {params.signedOut === 'true' && <p className="form-message">You have signed out.</p>}
      <form action={signIn} className="pilot-form">
        <input name="returnTo" type="hidden" value={params.returnTo || '/demo'} />
        <label htmlFor="pilot-email">Email</label>
        <input autoComplete="email" id="pilot-email" name="email" required type="email" />
        <label htmlFor="pilot-password">Password</label>
        <input
          autoComplete="current-password"
          id="pilot-password"
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
