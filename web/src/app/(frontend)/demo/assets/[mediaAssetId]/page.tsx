import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Clock3,
  Code2,
  Download,
  Folder,
  ImageIcon,
  Info,
  Pencil,
  RotateCcw,
  Settings2,
  Upload,
} from 'lucide-react'

import { parseMediaAssetId } from '@/media/identifiers'
import { getVisibleAsset, MediaLibraryError } from '@/media/library'
import { listMediaAccessViewers, OrganisationMediaAccessError } from '@/organisations/media-access'
import type { MediaAssetDetail } from '@/media/types'
import config from '@/payload.config'
import { getMember } from '@/members/session'

import { signOut } from '../../actions'
import { DashboardShell } from '../../DashboardShell'
import styles from './page.module.css'
import { DeleteAssetButton } from './DeleteAssetButton'
import { RetryProcessingButton } from './RetryProcessingButton'
import { PlaybackPlayer } from './PlaybackPlayer'
import { MediaAccessControls } from './MediaAccessControls'
import { mediaAssetPresentation as presentation } from './presentation'
import { ThumbnailPreview } from './ThumbnailPreview'

export const metadata: Metadata = { title: 'Media Asset | WeCloud Dashboard' }

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(timestamp),
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length)
  return `${(bytes / 1024 ** power).toFixed(2)} ${units[power - 1]}`
}

function formatRendition(height: number): string {
  const tier = height >= 1080 ? 'FHD' : height >= 720 ? 'HD' : height >= 480 ? 'SD' : 'Mobile'
  return `${height}p ${tier}`
}

function processingMessage(status: MediaAssetDetail['status']): string {
  switch (status) {
    case 'uploading':
      return 'The source is being uploaded. Playback will be available after processing finishes.'
    case 'queued':
      return 'This Media Asset is queued for processing.'
    case 'processing':
      return 'The protected Renditions are being prepared.'
    case 'expired':
      return 'This Media Asset has expired and can no longer be played.'
    default:
      return 'Playback is unavailable for this Media Asset.'
  }
}

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ mediaAssetId: string }>
  searchParams: Promise<{ autoplay?: string }>
}) {
  const member = await getMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo')
  const mediaAssetId = parseMediaAssetId((await params).mediaAssetId)
  if (!mediaAssetId) notFound()

  let asset: MediaAssetDetail
  let accessViewers: Awaited<ReturnType<typeof listMediaAccessViewers>> = []
  let organisationName = 'Organisation unavailable'
  let folderName = 'All Videos'
  try {
    const payload = await getPayload({ config })
    asset = await getVisibleAsset(payload, member, mediaAssetId)
    const [organisation, folder] = await Promise.all([
      asset.organisationID
        ? payload.findByID({
            collection: 'organisations',
            id: asset.organisationID,
            depth: 0,
            overrideAccess: true,
          })
        : null,
      asset.folderID
        ? payload.findByID({
            collection: 'media-folders',
            id: asset.folderID,
            depth: 0,
            overrideAccess: true,
          })
        : null,
    ])
    organisationName = organisation?.name ?? organisationName
    folderName = folder?.name ?? folderName
    if (asset.canShare && asset.organisationID && asset.status === 'ready') {
      accessViewers = await listMediaAccessViewers(payload, member, asset.assetID)
    }
  } catch (error) {
    if (error instanceof MediaLibraryError && error.status === 404) notFound()
    if (error instanceof OrganisationMediaAccessError && error.status === 403) notFound()
    throw error
  }

  const title = asset.fileName
  const renditions = asset.renditions ?? []
  const thumbnailSrc =
    asset.status === 'ready' && asset.processingJobId
      ? `/api/demo/assets/${asset.mediaAssetId}/thumbnail`
      : undefined

  return (
    <DashboardShell currentPath="/demo/videos">
      <main className={`dashboard-content ${styles.workspace}`} id="main-content">
        <header className={styles.header}>
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <Link href="/demo/videos">Videos</Link>
            <ChevronRight aria-hidden="true" size={15} />
            <span aria-current="page">{title}</span>
          </nav>
          <div className={styles.titleRow}>
            <h1>{title}</h1>
            {asset.canManage && (
              <button className={styles.quietButton} disabled type="button">
                <Pencil aria-hidden="true" size={15} /> Edit
              </button>
            )}
          </div>
          <section aria-label="Media Asset details" className={styles.metadata}>
            <span className={`asset-status asset-status--${asset.status}`}>{asset.status}</span>
            <span className={styles.metadataItem}>
              <span>Media Asset ID</span>
              <code>{asset.mediaAssetId}</code>
              <button aria-label="Copy Media Asset ID" disabled type="button">
                Copy
              </button>
            </span>
            <span className={styles.metadataItem}>
              <span>Uploaded</span> {formatTimestamp(asset.createdAt)}
            </span>
            {asset.readyAt && (
              <span className={styles.metadataItem}>
                <span>Ready</span> {formatTimestamp(asset.readyAt)}
              </span>
            )}
            <span className={styles.metadataItem}>
              <span>Updated</span> {formatTimestamp(asset.updatedAt)}
            </span>
            <span className={styles.metadataItem}>
              <span>Original filename</span> {asset.fileName}
            </span>
            <span className={styles.visuallyHidden}>Status</span>
          </section>
        </header>

        <div className={styles.columns}>
          <div className={styles.playerSlot}>
            {asset.status === 'ready' ? (
              <PlaybackPlayer
                autoStart={(await searchParams).autoplay === '1'}
                mediaAssetId={asset.mediaAssetId}
              />
            ) : (
              <section aria-label="Playback status" className={styles.playbackState}>
                <span className={styles.playbackStateIcon} aria-hidden="true">
                  {asset.status === 'failed' ? <AlertTriangle size={32} /> : <Clock3 size={32} />}
                </span>
                {asset.status === 'failed' ? (
                  <>
                    <h2>Processing failed</h2>
                    <p>{asset.failureMessage ?? 'Processing could not be completed.'}</p>
                    {asset.canManage && asset.canRetry ? (
                      <RetryProcessingButton mediaAssetId={asset.mediaAssetId} />
                    ) : (
                      <p>The source is no longer available. Upload the video again to continue.</p>
                    )}
                  </>
                ) : (
                  <>
                    <h2>
                      {asset.status === 'expired' ? 'Playback expired' : 'Preparing playback'}
                    </h2>
                    <p>{processingMessage(asset.status)}</p>
                  </>
                )}
              </section>
            )}
          </div>

          <section
            aria-label="Video Information"
            className={`${styles.card} ${styles.information}`}
          >
            <div className={styles.cardHeading}>
              <h2>
                <Info aria-hidden="true" size={19} /> Video Information
              </h2>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.sectionLabel}>Available Renditions</p>
              <div className={styles.renditions}>
                {renditions.length ? (
                  renditions.map((rendition) => (
                    <span
                      className={styles.rendition}
                      key={`${rendition.width}x${rendition.height}`}
                    >
                      {formatRendition(rendition.height)}
                    </span>
                  ))
                ) : (
                  <span className={styles.muted}>No Renditions available</span>
                )}
              </div>
              <dl className={styles.infoPairs}>
                <div>
                  <dt>Video DRM</dt>
                  <dd>{asset.mediaProtectionPolicy === 'protected' ? 'Enabled' : 'Not enabled'}</dd>
                </div>
                <div>
                  <dt>Original source size</dt>
                  <dd>{formatBytes(asset.size)}</dd>
                </div>
                <div>
                  <dt>Total storage</dt>
                  <dd>{presentation.totalStorage}</dd>
                </div>
              </dl>
              <div className={styles.infoSection}>
                <p className={styles.sectionLabel}>Subtitles</p>
                <span>{presentation.subtitleLanguages}</span>
                <button disabled type="button">
                  Manage subtitles
                </button>
              </div>
              <div className={styles.infoSection}>
                <p className={styles.sectionLabel}>Storage by Rendition</p>
                <div className={styles.storageTable} role="table" aria-label="Rendition storage">
                  <div role="row">
                    <span role="columnheader">Asset / Rendition</span>
                    <span role="columnheader">Size</span>
                  </div>
                  <div role="row">
                    <span role="cell">Original source</span>
                    <span role="cell">{formatBytes(asset.size)}</span>
                  </div>
                  {renditions.map((rendition) => (
                    <div role="row" key={`${rendition.width}x${rendition.height}`}>
                      <span role="cell">{formatRendition(rendition.height)}</span>
                      <span role="cell">
                        {presentation.renditionSizes[rendition.height] ??
                          presentation.unavailableSize}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div aria-label="Media Asset actions" className={styles.actionRow}>
            <button disabled type="button">
              <Code2 aria-hidden="true" size={17} /> Copy Embed Code
            </button>
            <button disabled type="button">
              <Download aria-hidden="true" size={17} /> Download Original
            </button>
            <button disabled type="button">
              <RotateCcw aria-hidden="true" size={17} /> Replace Video
            </button>
          </div>

          <section aria-label="Advanced Settings" className={`${styles.card} ${styles.advanced}`}>
            <div className={styles.cardHeading}>
              <h2>
                <Settings2 aria-hidden="true" size={19} /> Advanced Settings
              </h2>
              <span className={styles.cardPill}>Playback &amp; domain security</span>
            </div>
            <div className={styles.cardBody}>
              <p className={styles.sectionLabel}>Playback settings</p>
              <div className={styles.setting}>
                <div>
                  <strong>Autoplay</strong>
                  <p>Begin playback automatically when in view (muted by default).</p>
                </div>
                <input aria-label="Autoplay" disabled type="checkbox" />
              </div>
              <div className={styles.setting}>
                <div>
                  <strong>Loop Video</strong>
                  <p>Automatically replay after completion.</p>
                </div>
                <input aria-label="Loop Video" disabled type="checkbox" />
              </div>
              <div className={styles.setting}>
                <div>
                  <strong>Player Controls</strong>
                  <p>Show scrubbing, volume, and quality controls to viewers.</p>
                </div>
                <input aria-label="Player Controls" checked disabled readOnly type="checkbox" />
              </div>
              <p className={styles.sectionLabel}>Domain restrictions &amp; security</p>
              <label className={styles.domainField}>
                Allowed web domains
                <input
                  aria-label="Allowed web domains"
                  disabled
                  readOnly
                  value={presentation.allowedDomains}
                />
              </label>
            </div>
          </section>

          <section
            aria-label="Thumbnail Management"
            className={`${styles.card} ${styles.thumbnail}`}
          >
            <div className={styles.cardHeading}>
              <h2>
                <ImageIcon aria-hidden="true" size={19} /> Thumbnail Management
              </h2>
              <span className={styles.cardPill}>Poster</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.poster}>
                <ThumbnailPreview src={thumbnailSrc} title={title} />
              </div>
              <button className={styles.fullButton} disabled type="button">
                <Upload aria-hidden="true" size={17} /> Upload custom poster
              </button>
            </div>
          </section>

          <section aria-label="Video Analytics" className={`${styles.card} ${styles.analytics}`}>
            <div className={styles.cardHeading}>
              <h2>
                <Activity aria-hidden="true" size={19} /> Video Analytics
              </h2>
              <span className={styles.cardPill}>{presentation.analyticsPeriod}</span>
            </div>
            <div className={styles.analyticsGrid}>
              {presentation.analytics.map((metric) => (
                <div className={styles.metric} key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.detail}</small>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-label="Organisation and Folder"
            className={`${styles.card} ${styles.placement}`}
          >
            <div className={styles.cardHeading}>
              <h2>
                <Folder aria-hidden="true" size={19} /> Organisation and Folder
              </h2>
              <span className={styles.cardPill}>{organisationName}</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.folderRow}>
                <span>
                  <Folder aria-hidden="true" size={19} /> {folderName}
                </span>
                <button disabled type="button">
                  Move Media Asset
                </button>
              </div>
              <div className={styles.tag}>
                {presentation.tag}{' '}
                <button aria-label="Remove tag" disabled type="button">
                  ×
                </button>
              </div>
            </div>
          </section>

          <section aria-label="Danger Zone" className={`${styles.card} ${styles.danger}`}>
            <div className={styles.cardHeading}>
              <h2>
                <AlertTriangle aria-hidden="true" size={19} /> Danger Zone
              </h2>
            </div>
            <p>
              Deleting this Media Asset stops protected playback and removes its generated
              Renditions. This action cannot be undone.
            </p>
            {asset.canManage && <DeleteAssetButton mediaAssetId={asset.mediaAssetId} />}
          </section>
        </div>

        {asset.canShare && (
          <MediaAccessControls mediaAssetId={asset.mediaAssetId} viewers={accessViewers} />
        )}
        <form action={signOut} className={styles.signOut}>
          <button className="text-button" type="submit">
            Sign out
          </button>
        </form>
      </main>
    </DashboardShell>
  )
}
