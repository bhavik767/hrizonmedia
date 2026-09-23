import type { Metadata } from 'next'

const safeguards = [
  {
    number: '01',
    title: 'Encrypted from storage to screen',
    copy: 'Your source becomes adaptive, encrypted video before it reaches a viewer.',
  },
  {
    number: '02',
    title: 'Playback starts with permission',
    copy: 'Every licence begins with an ownership and access decision on the server.',
  },
  {
    number: '03',
    title: 'Delivery stays short-lived',
    copy: 'Asset-scoped access keeps manifests, segments, and licences on a tight leash.',
  },
]

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

export const dynamic = 'force-static'

export default async function HomePage() {
  const demoEnabled = process.env.HRIZONMEDIA_DEMO_ENABLED === 'true'

  return (
    <main id="main-content">
      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero__glow" aria-hidden="true" />
        <div className="hero__copy">
          <p className="eyebrow"><span aria-hidden="true" /> Secure video platform</p>
          <h1 id="hero-title">
            <span>Plays where you allow it.</span>
            <span className="signal-text">Nowhere else.</span>
          </h1>
          <p className="hero__lede">
            Upload your video once. HrizonMedia encrypts, stores, and delivers it, then
            authorises playback only for the viewers you approve.
          </p>
          {!demoEnabled && <p className="demo-note">Private pilot opening soon.</p>}
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
          <p className="eyebrow">How control travels</p>
          <h2 id="safeguards-title">Security at every handoff.</h2>
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
        <h2 id="promise-title">The video and its permission stay together.</h2>
        <p>
          From upload to licence exchange, HrizonMedia keeps each Media Asset encrypted and
          each playback accountable.
        </p>
      </section>
    </main>
  )
}
