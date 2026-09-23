import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { parseMediaAssetId } from '@/media/identifiers'
import { getVisibleAsset, MediaLibraryError } from '@/media/library'
import { listMediaAccessViewers, OrganisationMediaAccessError } from '@/organisations/media-access'
import type { MediaAssetDetail } from '@/media/types'
import config from '@/payload.config'
import { ensureDemoEnabled } from '@/pilot/demoAvailability'
import { getPilotMember } from '@/pilot/session'

import { signOut } from '../../actions'
import { DeleteAssetButton } from './DeleteAssetButton'
import { RetryProcessingButton } from './RetryProcessingButton'
import { PlaybackPlayer } from './PlaybackPlayer'
import { MediaAccessControls } from './MediaAccessControls'

export const metadata: Metadata = { title: 'Media Asset | HrizonMedia Demo' }

export default async function AssetPage({ params }: { params: Promise<{ mediaAssetId: string }> }) {
  await ensureDemoEnabled()
  const member = await getPilotMember()
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
    <main className="demo-page shell" id="main-content">
      <p className="eyebrow">
        <span aria-hidden="true" />
        Private Media Asset
      </p>
      <h1>{asset.fileName}</h1>
      <dl className="asset-detail">
        <div>
          <dt>Status</dt>
          <dd>{asset.status}</dd>
        </div>
        <div>
          <dt>Media Asset ID</dt>
          <dd>{asset.mediaAssetId}</dd>
        </div>
        <div>
          <dt>Upload Session ID</dt>
          <dd>{asset.uploadSessionId}</dd>
        </div>
        <div>
          <dt>Processing Job ID</dt>
          <dd>{asset.processingJobId}</dd>
        </div>
        <div>
          <dt>Provider Job ID</dt>
          <dd>{asset.providerJobId}</dd>
        </div>
        {asset.renditions && (
          <div>
            <dt>Adaptive outputs</dt>
            <dd>{asset.renditions.map(({ height }) => `${height}p H.264/AAC`).join(', ')}</dd>
          </div>
        )}
      </dl>
      {asset.status === 'ready' && <PlaybackPlayer mediaAssetId={asset.mediaAssetId} />}
      {asset.canShare && (
        <MediaAccessControls mediaAssetId={asset.mediaAssetId} viewers={accessViewers} />
      )}
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
      <div className="demo-actions">
        {asset.canManage && <DeleteAssetButton mediaAssetId={asset.mediaAssetId} />}
        <Link className="text-link" href="/demo">
          Back to library
        </Link>
        <form action={signOut}>
          <button className="text-button" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}
