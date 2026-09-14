import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Demo | HrizonMedia',
  description: 'Private HrizonMedia secure-video pilot Demo.',
}

export default async function DemoPage() {
  await connection()

  if (process.env.HRIZONMEDIA_DEMO_ENABLED !== 'true') notFound()

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow"><span aria-hidden="true" /> Private pilot</p>
      <h1>HrizonMedia Demo</h1>
      <p>
        The secure-video workspace is ready for the invited pilot. Sign-in and upload
        access arrive in the next MVP slice.
      </p>
      <Link className="text-link" href="/">Return home</Link>
    </main>
  )
}
