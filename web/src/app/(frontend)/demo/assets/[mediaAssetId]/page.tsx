import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { parseMediaAssetId } from '@/media/identifiers'
import { getOwnedAsset, MediaLibraryError } from '@/media/library'
import type { MediaAssetDetail } from '@/media/types'
import config from '@/payload.config'
import { ensureDemoEnabled } from '@/pilot/demoAvailability'
import { getPilotMember } from '@/pilot/session'

import { signOut } from '../../actions'
import { RetryProcessingButton } from './RetryProcessingButton'
import { PlaybackPlayer } from './PlaybackPlayer'

export const metadata: Metadata = { title: 'Media Asset | HrizonMedia Demo' }

export default async function AssetPage({ params }: { params: Promise<{ mediaAssetId: string }> }) {
  await ensureDemoEnabled()
  const member = await getPilotMember()
  if (!member) redirect('/demo/sign-in?returnTo=%2Fdemo')
  if (member.role !== 'uploader') notFound()
  const mediaAssetId = parseMediaAssetId((await params).mediaAssetId)
  if (!mediaAssetId) notFound()

  let asset: MediaAssetDetail
  try {
    asset = await getOwnedAsset(await getPayload({ config }), member, mediaAssetId)
  } catch (error) {
    if (error instanceof MediaLibraryError && error.status === 404) notFound()
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
      {asset.status === 'ready' && (
        <PlaybackPlayer mediaAssetId={asset.mediaAssetId} viewerEmail={member.email} />
      )}
      {asset.status === 'failed' && asset.failureMessage && (
        <section aria-labelledby="processing-failure-title" className="processing-failure">
          <h2 id="processing-failure-title">Processing failed</h2>
          <p>{asset.failureMessage}</p>
          {asset.canRetry ? (
            <RetryProcessingButton mediaAssetId={asset.mediaAssetId} />
          ) : (
            <p>The source is no longer available. Upload the video again to continue.</p>
          )}
        </section>
      )}
      <div className="demo-actions">
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
