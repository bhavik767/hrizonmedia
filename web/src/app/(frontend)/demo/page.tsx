import type { Metadata } from 'next'
import Link from 'next/link'

import { signOut } from './actions'
import { DashboardOverview } from './DashboardOverview'
import { DashboardShell } from './DashboardShell'
import { getDashboardData } from './dashboardData'
import { MediaLibrary } from './MediaLibrary'

export const metadata: Metadata = {
  title: 'Dashboard | WeCloud',
  description: 'Your WeCloud secure-video Dashboard.',
}

export default async function DemoPage() {
  const dashboard = await getDashboardData()

  return (
    <DashboardShell currentPath="/demo">
      <main className="dashboard-content" id="main-content">
        <DashboardOverview
          administratorOrganisationID={dashboard.administratorOrganisationID}
          memberEmail={dashboard.member.email}
          memberName={dashboard.member.name}
          platformAdministration={dashboard.platformAdministration}
        />
        {dashboard.organisationLogoDataURL && (
          <img
            alt="Organisation Logo"
            className="organisation-logo"
            src={dashboard.organisationLogoDataURL}
          />
        )}
        <div className="dashboard-utility-actions">
          {dashboard.organisationSettingsLinks.map(({ href, label }) => (
            <Link className="text-link" href={href} key={href}>
              {label}
            </Link>
          ))}
          <form action={signOut}>
            <button className="text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
        <MediaLibrary
          libraryOrganisations={dashboard.libraryOrganisations}
          uploadOrganisations={dashboard.uploadOrganisations}
        />
      </main>
    </DashboardShell>
  )
}
