import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { ensureDemoEnabled } from '@/pilot/demoAvailability'
import { getOperatorOverview } from '@/pilot/operations'
import { getPilotMember } from '@/pilot/session'

import { disableMember, saveOperationalControls } from './actions'

export const metadata: Metadata = { title: 'Operator oversight | HrizonMedia Demo' }

function readableAction(action: string): string {
  return action.replaceAll('_', ' ')
}

export default async function OperatorOperationsPage() {
  await ensureDemoEnabled()
  const member = await getPilotMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo%2Foperations')
  if (member.role !== 'operator') redirect('/demo')
  const overview = await getOperatorOverview(await getPayload({ config }), member)

  return (
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" /> Operator access
      </p>
      <h1>Operator oversight</h1>
      <p>Inspect the pilot, investigate activity, and stop provider usage safely.</p>

      <section className="media-library" aria-labelledby="operating-controls-title">
        <h2 id="operating-controls-title">Operating controls</h2>
        {overview.controls.killSwitchEnabled && (
          <p className="form-message form-message--error" role="status">
            Media activity is paused.
          </p>
        )}
        <form action={saveOperationalControls} className="upload-form">
          <label htmlFor="provider-concurrency">Provider concurrency</label>
          <input
            defaultValue={overview.controls.providerConcurrency}
            id="provider-concurrency"
            max="100"
            min="1"
            name="providerConcurrency"
            required
            type="number"
          />
          <label>
            <input
              defaultChecked={overview.controls.killSwitchEnabled}
              name="killSwitchEnabled"
              type="checkbox"
            />{' '}
            Pause all media activity
          </label>
          <button className="primary-action" type="submit">
            Save operating controls
          </button>
        </form>
      </section>

      <section className="media-library" aria-labelledby="pilot-members-title">
        <h2 id="pilot-members-title">Pilot Members</h2>
        <div className="asset-list">
          {overview.members.map((pilotMember) => (
            <article className="asset-card" key={pilotMember.id}>
              <div>
                <h3>{pilotMember.name}</h3>
                <p>{pilotMember.email}</p>
              </div>
              <strong className={`asset-status asset-status--${pilotMember.status}`}>
                {pilotMember.status}
              </strong>
              <p>{pilotMember.role}</p>
              {pilotMember.status === 'active' && pilotMember.id !== member.id && (
                <form action={disableMember}>
                  <input name="memberID" type="hidden" value={pilotMember.id} />
                  <button
                    aria-label={`Disable ${pilotMember.email}`}
                    className="text-button"
                    type="submit"
                  >
                    Disable member
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="media-library" aria-labelledby="all-assets-title">
        <h2 id="all-assets-title">All Media Assets</h2>
        <div className="asset-list">
          {overview.assets.map((asset) => (
            <article className="asset-card" key={asset.mediaAssetId}>
              <div>
                <h3>{asset.fileName}</h3>
                <p>{asset.ownerEmail}</p>
              </div>
              <strong className={`asset-status asset-status--${asset.status}`}>
                {asset.status}
              </strong>
              <Link className="text-link" href={`/demo/assets/${asset.mediaAssetId}`}>
                Inspect asset
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="media-library" aria-labelledby="audit-events-title">
        <h2 id="audit-events-title">Audit Events</h2>
        {overview.auditEvents.length === 0 ? (
          <p>No events recorded yet.</p>
        ) : (
          <div className="asset-list">
            {overview.auditEvents.map((event, index) => (
              <article className="asset-card" key={`${event.occurredAt}:${event.action}:${index}`}>
                <div>
                  <h3>{readableAction(event.action)}</h3>
                  <p>{new Date(event.occurredAt).toLocaleString()}</p>
                  {event.assetId && <p>{event.assetId}</p>}
                </div>
                <p>{event.actorEmail ?? 'System'}</p>
                {event.memberEmail && <p>{event.memberEmail}</p>}
                {event.details && <code>{JSON.stringify(event.details)}</code>}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
