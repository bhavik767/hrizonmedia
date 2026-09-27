import Link from 'next/link'
import { Archive, CircleHelp, Code2, Globe2, Radio, Server, UserRound } from 'lucide-react'
import type { ComponentType } from 'react'

const moduleDetails = {
  account: {
    breadcrumb: 'Account & Organization',
    description:
      'Manage your organization profile, multi-factor authentication, team member permissions, automated invoicing, and security compliance audit trails.',
    features: [
      [
        'Enterprise SSO / SAML',
        'Connect Google Workspace, Okta, or Azure AD for seamless team authentication.',
      ],
      [
        'Granular Role-Based Access',
        'Create scoped roles for organisation administration, publishing, and viewing.',
      ],
      [
        'Tax Invoicing & GST',
        'Automated monthly GST invoices, credit threshold alerts, and centralized billing.',
      ],
      [
        'Comprehensive Audit Logs',
        'Immutable activity logs recording Media Asset and access-policy activity.',
      ],
    ],
    icon: UserRound,
    iconColor: '#10b981',
    release: 'Q4 2026 Planned',
    title: 'Account & Organization Settings',
  },
  cdn: {
    breadcrumb: 'Global Edge CDN',
    description:
      'Ultra-fast video edge delivery network with global points of presence, real-time purge, and automated TLS certificate provisioning.',
    features: [
      [
        '240+ Global PoPs',
        'Low-latency video delivery across Indian and international internet providers.',
      ],
      [
        'Instant Cache Purge',
        'Globally invalidate video playlists or chunks through the delivery API.',
      ],
      ['Custom Domain & SSL', 'Bind custom stream domains with automatic certificate renewal.'],
      [
        'DDoS & Token Auth',
        'Built-in edge rate limiting, geo-fencing, and signed URL token verification.',
      ],
    ],
    icon: Globe2,
    iconColor: '#a855f7',
    release: 'Q4 2026 Planned',
    title: 'Global Edge CDN Distribution',
  },
  integrations: {
    breadcrumb: 'Developer Integrations',
    description:
      'Deep integrations with learning management systems, webhook event subscriptions, and programmatic API access.',
    features: [
      [
        'LMS Native Plugins',
        'Plug-and-play Media Asset embeds for Moodle, Canvas, and educational apps.',
      ],
      [
        'Webhook Event Streams',
        'Subscribe to lifecycle events such as media.ready and encoding.progress.',
      ],
      [
        'REST & GraphQL APIs',
        'Programmatic control over uploads, metadata, and analytics querying.',
      ],
      [
        'Zapier & Make Automations',
        'Automate workflows such as ingesting lecture recordings from Google Drive or Zoom.',
      ],
    ],
    icon: Code2,
    iconColor: '#f59e0b',
    release: 'Q4 2026 Planned',
    title: 'Developer Integrations & LMS Connectors',
  },
  live: {
    breadcrumb: 'Live Streaming',
    description:
      'Broadcast ultra-low latency interactive live video with instant cloud DVR archiving and adaptive multi-bitrate delivery.',
    features: [
      ['Sub-Second LL-HLS', 'Ultra-low latency streaming for live classroom interactions.'],
      [
        'Auto Cloud DVR & Archive',
        'Automatically transition a live stream into a ready-to-view Media Asset.',
      ],
      [
        'RTMP & SRT Ingest',
        'Hardware encoder and OBS compatibility with redundant edge ingest points.',
      ],
      [
        'Real-Time Telemetry',
        'Live viewer concurrency, bitrate stability, and participant drop-off metrics.',
      ],
    ],
    icon: Radio,
    iconColor: '#ef4444',
    release: 'Q4 2026 Beta',
    title: 'Live Streaming Engine',
  },
  storage: {
    breadcrumb: 'Storage',
    description:
      'Give organisation administrators a clear view of protected Media Asset storage, retention, and delivery outputs.',
    features: [
      [
        'Storage Usage',
        'See source and rendition storage totals for every Media Asset in the organisation.',
      ],
      [
        'Retention Controls',
        'Set a default Media Asset retention period within your platform-plan limit.',
      ],
      [
        'Source Lifecycle',
        'Track the short-lived source retention window separately from protected delivery outputs.',
      ],
      [
        'Delivery Footprint',
        'Understand how adaptive renditions contribute to protected playback storage.',
      ],
    ],
    icon: Archive,
    iconColor: '#38bdf8',
    release: 'Q4 2026 Planned',
    title: 'Storage & Retention Controls',
  },
  support: {
    breadcrumb: 'Support & SLA',
    description:
      'Priority incident response, a direct line to solutions architects, and custom service-level agreements.',
    features: [
      [
        '15-Minute SLA Guarantee',
        'Rapid engineering response for critical live broadcast and delivery incidents.',
      ],
      [
        'Dedicated Technical Account Manager',
        'Direct contact with streaming architects for capacity planning.',
      ],
      ['Emergency Live Broadcast Hotline', '24/7 on-call support during peak streaming events.'],
      [
        'Architecture Review',
        'Quarterly review of encoding profiles, bitrate ladders, and delivery efficiency.',
      ],
    ],
    icon: CircleHelp,
    iconColor: '#06b6d4',
    release: 'Q4 2026 Planned',
    title: 'Enterprise Support & SLA',
  },
} as const

export type DemoModule = keyof typeof moduleDetails

export function isDemoModule(value: string): value is DemoModule {
  return value in moduleDetails
}

export function ComingSoonPage({ module }: { module: DemoModule }) {
  const details = moduleDetails[module]
  const Icon: ComponentType<{ 'aria-hidden'?: boolean; size?: number; strokeWidth?: number }> =
    details.icon

  return (
    <section aria-labelledby="coming-soon-title" className="coming-soon-page">
      <nav aria-label="Breadcrumb" className="coming-soon-breadcrumb">
        <Link href="/demo/videos">Videos</Link>
        <span aria-hidden="true">/</span>
        <span>{details.breadcrumb}</span>
      </nav>
      <div className="coming-soon-hero-card">
        <div aria-hidden="true" className="coming-soon-glow" />
        <div className="coming-soon-icon" style={{ color: details.iconColor }}>
          <Icon aria-hidden size={32} strokeWidth={2} />
        </div>
        <div className="coming-soon-badge-row">
          <span className="coming-soon-badge">
            <span aria-hidden="true" className="coming-soon-pulse" />
            Coming soon
          </span>
          <span className="coming-soon-release">{details.release}</span>
        </div>
        <h1 id="coming-soon-title">{details.title}</h1>
        <p className="coming-soon-description">{details.description}</p>
        <div className="coming-soon-feature-grid">
          {details.features.map(([title, description]) => (
            <article className="coming-soon-feature" key={title}>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className="coming-soon-actions">
          <div>
            <strong>Want early access to this module?</strong>
            <p>We’ll notify your organisation when its rollout starts.</p>
          </div>
          <Link className="primary-action" href="/demo/videos">
            <Server aria-hidden size={16} /> Back to Videos
          </Link>
        </div>
      </div>
    </section>
  )
}
