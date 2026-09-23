import Link from 'next/link'

const metrics = [
  { detail: '12.4 GB of 100 GB', label: 'Storage Usage', value: '12%' },
  { detail: 'This billing period', label: 'Bandwidth Consumption', value: '284 GB' },
  { detail: 'All queues healthy', label: 'Video Processing', value: '99.8%' },
  { detail: 'Global edge delivery', label: 'CDN Performance', value: '42 ms' },
]

export function DashboardOverview({
  administratorOrganisationID,
  memberEmail,
  memberName,
}: {
  administratorOrganisationID: number | null
  memberEmail: string
  memberName: string
}) {
  return (
    <>
      <section className="dashboard-intro" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">
            <span aria-hidden="true" /> Dashboard overview
          </p>
          <h1 id="dashboard-title">Dashboard</h1>
          <p className="dashboard-intro__greeting">Welcome back, {memberName}</p>
          <p>
            Signed in as {memberName} ({memberEmail}). Your protected delivery is healthy.
          </p>
        </div>
        <div className="dashboard-actions" aria-label="Dashboard actions">
          <Link className="primary-action" href="/demo/videos#video-file">
            Upload Video
          </Link>
          {administratorOrganisationID && (
            <Link
              className="dashboard-secondary-action"
              href={`/demo/organisations/${administratorOrganisationID}/members`}
            >
              Invite User
            </Link>
          )}
          <button disabled type="button">
            Create Live Stream
          </button>
          <button disabled type="button">
            Manage Storage
          </button>
        </div>
      </section>

      <section aria-labelledby="dashboard-metrics-title" className="dashboard-metrics">
        <h2 id="dashboard-metrics-title">Platform health</h2>
        <div className="dashboard-metrics__grid">
          {metrics.map(({ detail, label, value }) => (
            <article className="dashboard-metric" key={label}>
              <p>{label}</p>
              <strong>{value}</strong>
              <span>{detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="usage-overview-title" className="usage-overview">
        <div>
          <p className="eyebrow">
            <span aria-hidden="true" /> Last 30 days
          </p>
          <h2 id="usage-overview-title">Usage Overview</h2>
        </div>
        <div aria-label="Static usage overview chart" className="usage-overview__chart" role="img">
          {[34, 52, 43, 68, 58, 82, 66, 92, 76, 88, 71, 96].map((height, index) => (
            <span key={index} style={{ height: `${height}%` }} />
          ))}
        </div>
      </section>
    </>
  )
}
