import type { Metadata } from 'next'

import { DashboardShell } from '../DashboardShell'
import { getDashboardData } from '../dashboardData'
import { MediaLibrary } from '../MediaLibrary'

export const metadata: Metadata = {
  title: 'Video | WeCloud Dashboard',
  description: 'Manage Media Assets in the WeCloud Dashboard.',
}

export default async function VideoPage() {
  const dashboard = await getDashboardData()

  return (
    <DashboardShell currentPath="/demo/videos">
      <main className="dashboard-content" id="main-content">
        <section className="dashboard-page-heading" aria-labelledby="video-title">
          <p className="eyebrow">
            <span aria-hidden="true" /> Media Library
          </p>
          <h1 id="video-title">Video</h1>
          <p>Upload, organize, and inspect the Media Assets in your Organisation.</p>
        </section>
        <MediaLibrary
          libraryOrganisations={dashboard.libraryOrganisations}
          uploadOrganisations={dashboard.uploadOrganisations}
        />
      </main>
    </DashboardShell>
  )
}
