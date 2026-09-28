import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getMember } from '@/members/session'

import { DashboardShell } from '../DashboardShell'
import { PasswordForm } from './PasswordForm'

export const metadata: Metadata = { title: 'Account | WeCloud Dashboard' }

export default async function AccountPage() {
  const member = await getMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo%2Faccount')

  return (
    <DashboardShell currentPath="/demo/account">
      <main className="dashboard-content demo-page" id="main-content">
        <p className="eyebrow">
          <span aria-hidden="true" /> Account
        </p>
        <h1>Account security</h1>
        <p>
          Signed in as {member.name} ({member.email}).
        </p>
        <h2>Change password</h2>
        <p>Use at least 8 characters. Changing your password signs out your other sessions.</p>
        <PasswordForm />
      </main>
    </DashboardShell>
  )
}
