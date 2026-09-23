import type { Metadata } from 'next'
import Link from 'next/link'

import { StructuredData } from '@/utilities/schema/StructuredData'

const safeguards = [
  {
    number: '01',
    title: 'Secure upload',
    copy: 'Start with a secure upload session that keeps your source on a protected path.',
  },
  {
    number: '02',
    title: 'Protected playback',
    copy: 'Encrypted delivery and DRM keep playback where your organisation allows it.',
  },
  {
    number: '03',
    title: 'Controlled access',
    copy: 'Asset-scoped access keeps each viewer and every playback decision accountable.',
  },
]

export const metadata: Metadata = {
  alternates: { canonical: 'https://wecloud.biz/' },
}

export const dynamic = 'force-static'

const publicSiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'WeCloud',
  url: 'https://wecloud.biz/',
}

export default async function HomePage() {
  const demoEnabled = process.env.HRIZONMEDIA_DEMO_ENABLED === 'true'

  return (
    <main id="main-content">
      <StructuredData schema={publicSiteSchema} />
      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero__glow" aria-hidden="true" />
        <div className="hero__copy">
          <p className="eyebrow"><span aria-hidden="true" /> Secure video platform</p>
          <h1 id="hero-title">
            <span>Secure video,</span>
            <span className="signal-text">under your control.</span>
          </h1>
          <p className="hero__lede">
            WeCloud gives your organisation a secure path from upload to protected playback,
            with access you can control at every step.
          </p>
          {demoEnabled && (
            <Link
              aria-label="Open WeCloud Dashboard"
              className="primary-action hero__action"
              href="/demo"
            >
              Dashboard
              <svg aria-hidden="true" className="action-arrow" viewBox="0 0 16 16">
                <path d="M3 13 13 3M6 3h7v7" />
              </svg>
            </Link>
          )}
          {!demoEnabled && <p className="demo-note">Private workspace opening soon.</p>}
        </div>
        <div className="control-plate" aria-label="Secure delivery flow">
          <div className="control-plate__topline">
            <span>Asset 0042</span>
            <span className="status"><i aria-hidden="true" /> Protected</span>
          </div>
          <div className="playback-frame">
            <svg aria-hidden="true" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="38" />
              <path d="m33 25 22 15-22 15V25Z" />
            </svg>
          </div>
          <div className="control-plate__meter"><span /></div>
          <div className="control-plate__footer">
            <span>Encrypted delivery</span>
            <span>00:42 / 12:18</span>
          </div>
        </div>
      </section>

      <section className="safeguards shell" aria-labelledby="safeguards-title">
        <div className="section-heading">
          <p className="eyebrow">Built for secure video</p>
          <h2 id="safeguards-title">Control every step, without slowing down.</h2>
        </div>
        <div className="safeguard-grid">
          {safeguards.map((safeguard) => (
            <article className="safeguard-card" key={safeguard.number}>
              <span className="card-number">{safeguard.number}</span>
              <h3>{safeguard.title}</h3>
              <p>{safeguard.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="promise shell" aria-labelledby="promise-title">
        <p className="eyebrow">One platform, one policy</p>
        <h2 id="promise-title">Your video and its access policy stay together.</h2>
        <p>
          From upload to licence exchange, WeCloud keeps each Media Asset encrypted and every
          playback accountable.
        </p>
      </section>
    </main>
  )
}
