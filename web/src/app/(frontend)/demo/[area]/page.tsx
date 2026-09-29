import { notFound } from 'next/navigation'

import { DashboardShell } from '../DashboardShell'
import { getDashboardData } from '../dashboardData'
import { ComingSoonPage as ComingSoonPanel, isDashboardModule } from '../ComingSoonPage'

export default async function ComingSoonPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params
  if (!isDashboardModule(area)) notFound()

  await getDashboardData()

  return (
    <DashboardShell currentPath={`/demo/${area}`}>
      <main className="dashboard-content" id="main-content">
        <ComingSoonPanel module={area} />
      </main>
    </DashboardShell>
  )
}
