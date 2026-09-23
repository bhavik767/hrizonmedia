import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { parseMediaAssetId } from '@/media/identifiers'
import { getVisibleAsset, MediaLibraryError } from '@/media/library'
import { listMediaAccessViewers, OrganisationMediaAccessError } from '@/organisations/media-access'
import type { MediaAssetDetail } from '@/media/types'
import config from '@/payload.config'
import { ensureDemoEnabled } from '@/members/demoAvailability'
import { getMember } from '@/members/session'

import { signOut } from '../../actions'
import { DashboardShell } from '../../DashboardShell'
import styles from './page.module.css'
import { DeleteAssetButton } from './DeleteAssetButton'
import { RetryProcessingButton } from './RetryProcessingButton'
import { PlaybackPlayer } from './PlaybackPlayer'
import { MediaAccessControls } from './MediaAccessControls'

export const metadata: Metadata = { title: 'Media Asset | WeCloud Dashboard' }

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

export default async function AssetPage({ params }: { params: Promise<{ mediaAssetId: string }> }) {
  await ensureDemoEnabled()
  const member = await getMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo')
  const mediaAssetId = parseMediaAssetId((await params).mediaAssetId)
  if (!mediaAssetId) notFound()

  let asset: MediaAssetDetail
  let accessViewers: Awaited<ReturnType<typeof listMediaAccessViewers>> = []
  try {
    const payload = await getPayload({ config })
    asset = await getVisibleAsset(payload, member, mediaAssetId)
    if (asset.canShare && asset.organisationID && asset.status === 'ready') {
      accessViewers = await listMediaAccessViewers(payload, member, asset.assetID)
    }
  } catch (error) {
    if (error instanceof MediaLibraryError && error.status === 404) notFound()
    if (error instanceof OrganisationMediaAccessError && error.status === 403) notFound()
    throw error
  }

  return (
    <DashboardShell currentPath="/demo">
      <main className="dashboard-content demo-page" id="main-content">
        <header className={styles.header}>
          <Link className={styles.back} href="/demo/videos">
            Video library
          </Link>
          <div className={styles.titleRow}>
            <div>
              <p className="eyebrow">
                <span aria-hidden="true" /> Media Asset
              </p>
              <h1>{asset.fileName}</h1>
            </div>
            <span className={`asset-status asset-status--${asset.status}`}>{asset.status}</span>
          </div>
          <section aria-label="Media Asset details" className={styles.metadata}>
            <dl>
              <div>
                <dt>Media Asset ID</dt>
                <dd>{asset.mediaAssetId}</dd>
              </div>
              <div>
                <dt>Uploaded</dt>
                <dd>{formatTimestamp(asset.createdAt)}</dd>
              </div>
              {asset.readyAt && (
                <div>
                  <dt>Ready</dt>
                  <dd>{formatTimestamp(asset.readyAt)}</dd>
                </div>
              )}
              <div>
                <dt>Status</dt>
                <dd>{asset.status}</dd>
              </div>
            </dl>
          </section>
        </header>

        <div className={styles.layout}>
          <div className={styles.main}>
            {asset.status === 'ready' && <PlaybackPlayer mediaAssetId={asset.mediaAssetId} />}
            {asset.status === 'failed' && asset.failureMessage && (
              <section aria-labelledby="processing-failure-title" className="processing-failure">
                <h2 id="processing-failure-title">Processing failed</h2>
                <p>{asset.failureMessage}</p>
                {asset.canManage && asset.canRetry ? (
                  <RetryProcessingButton mediaAssetId={asset.mediaAssetId} />
                ) : (
                  <p>The source is no longer available. Upload the video again to continue.</p>
                )}
              </section>
            )}
          </div>
          <aside aria-label="Media Asset actions" className={styles.sidebar}>
            <p className="eyebrow">
              <span aria-hidden="true" /> Actions
            </p>
            <div className={styles.actions}>
              <Link className="text-link" href="/demo/videos">
                Back to Video library
              </Link>
              {asset.canManage && <DeleteAssetButton mediaAssetId={asset.mediaAssetId} />}
              <form action={signOut}>
                <button className="text-button" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </aside>
        </div>
        {asset.canShare && (
          <MediaAccessControls mediaAssetId={asset.mediaAssetId} viewers={accessViewers} />
        )}
      </main>
    </DashboardShell>
  )
}
