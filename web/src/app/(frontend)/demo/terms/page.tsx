import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ensureDemoEnabled } from '@/pilot/demoAvailability'
import { getPilotMember } from '@/pilot/session'

export const metadata: Metadata = { title: 'Pilot terms | HrizonMedia Demo' }

export default async function PilotTermsPage() {
  await ensureDemoEnabled()
  const member = await getPilotMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo%2Fterms')

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Private pilot
      </p>
      <h1>Pilot terms</h1>
      <section aria-labelledby="playback-watermark-term">
        <h2 id="playback-watermark-term">Playback watermark</h2>
        <p>
          Secure playback displays a compact, opaque Leak ID and a server-issued timestamp over the
          video. The watermark changes periodically through the picture and remains visible in
          fullscreen so that recordings can be investigated without displaying your email.
        </p>
        <p>
          Pilot playback is streaming-only. Downloads, offline storage, persistent licences, and
          picture-in-picture are disabled.
        </p>
      </section>
      <Link className="text-link" href="/demo">
        Back to Demo
      </Link>
    </main>
  )
}
