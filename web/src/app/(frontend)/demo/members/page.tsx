import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'

import { getPilotMember } from '@/pilot/session'

import { InviteMemberForm } from './InviteMemberForm'

export const metadata: Metadata = { title: 'Invite Pilot Members | HrizonMedia Demo' }

export default async function PilotMembersPage() {
  await connection()
  if (process.env.HRIZONMEDIA_DEMO_ENABLED !== 'true') notFound()

  const member = await getPilotMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo%2Fmembers')
  if (member.role !== 'operator') redirect('/demo')

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Operator access
      </p>
      <h1>Invite a Pilot Member</h1>
      <p>Create a single-use password setup link. It expires after 24 hours.</p>
      <InviteMemberForm />
    </main>
  )
}
