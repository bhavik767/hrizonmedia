import { notFound } from 'next/navigation'

import { DashboardShell } from '../DashboardShell'
import { getDashboardData } from '../dashboardData'
import { ComingSoonPage, isDemoModule } from '../ComingSoonPage'

export default async function ComingSoonPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params
  if (!isDemoModule(area)) notFound()

  await getDashboardData()

  return (
    <DashboardShell currentPath={`/demo/${area}`}>
      <main className="dashboard-content" id="main-content">
        <ComingSoonPage module={area} />
      </main>
    </DashboardShell>
  )
}
