import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ensureDemoEnabled } from '@/members/demoAvailability'
import { getMember } from '@/members/session'

export const metadata: Metadata = { title: 'Workspace terms | HrizonMedia Demo' }

export default async function DemoTermsPage() {
  await ensureDemoEnabled()
  const member = await getMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo%2Fterms')

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Private workspace
      </p>
      <h1>Workspace terms</h1>
      <section aria-labelledby="playback-watermark-term">
        <h2 id="playback-watermark-term">Playback watermark</h2>
        <p>
          Secure playback displays a compact, opaque Leak ID and a server-issued timestamp over the
          video. The watermark changes periodically through the picture and remains visible in
          fullscreen so that recordings can be investigated without displaying your email.
        </p>
        <p>
          Protected playback is streaming-only. Downloads, offline storage, persistent licences, and
          picture-in-picture are disabled.
        </p>
        <p>
          DRM, browser controls, and the watermark deter and help investigate leaks; they cannot
          guarantee prevention of screen recording, external-output capture, or camera capture.
        </p>
      </section>
      <Link className="text-link" href="/demo">
        Back to Demo
      </Link>
    </main>
  )
}
