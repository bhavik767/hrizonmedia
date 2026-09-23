import { notFound } from 'next/navigation'

import { DashboardShell } from '../DashboardShell'
import { getDashboardData } from '../dashboardData'

const pages = {
  account: {
    description:
      'Your Organisation profile, billing controls, and account preferences will appear here.',
    title: 'Account controls are coming soon',
  },
  cdn: {
    description: 'Global delivery controls and performance insights will appear here.',
    title: 'CDN controls are coming soon',
  },
  integrations: {
    description: 'Connect the tools your Organisation already depends on from one secure place.',
    title: 'Integrations are coming soon',
  },
  live: {
    description:
      'Prepare reliable live video experiences with the same protected delivery controls.',
    title: 'Live video is coming soon',
  },
  storage: {
    description:
      'Manage your media storage with simple controls. Save up to 50% on Amazon S3 storage.',
    title: 'Storage management is coming soon',
  },
  support: {
    description: 'Guidance and support for your secure-video workflow will appear here.',
    title: 'Support is coming soon',
  },
} as const

export default async function ComingSoonPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params
  if (!(area in pages)) notFound()

  await getDashboardData()
  const page = pages[area as keyof typeof pages]

  return (
    <DashboardShell currentPath={`/demo/${area}`}>
      <main className="dashboard-content" id="main-content">
        <section className="coming-soon" aria-labelledby="coming-soon-title">
          <p className="eyebrow">
            <span aria-hidden="true" /> Coming soon
          </p>
          <h1 id="coming-soon-title">{page.title}</h1>
          <p>{page.description}</p>
          <div aria-hidden="true" className="coming-soon__preview">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    </DashboardShell>
  )
}
