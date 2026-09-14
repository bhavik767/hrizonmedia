'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import type { MediaAssetSummary } from '@/media/types'

type DisplayedAsset = Omit<MediaAssetSummary, 'mediaAssetId'> & { mediaAssetId: string }

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function responseJSON<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'The media request failed.')
  return body
}

export function MediaLibrary() {
  const [assets, setAssets] = useState<DisplayedAsset[]>([])
  const [error, setError] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/demo/assets', { cache: 'no-store' })
    const result = await responseJSON<{ assets: MediaAssetSummary[] }>(response)
    setAssets(result.assets)
    setLoading(false)
  }, [])

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    void refresh().catch((caught: Error) => {
      setError(caught.message)
      setLoading(false)
    })
  }, [refresh])

  useEffect(() => {
    if (!assets.some(({ status }) => status === 'queued' || status === 'processing')) return
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 250)
    return () => window.clearInterval(timer)
  }, [assets, refresh])

  async function upload(formData: FormData) {
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return

    setError('')
    setUploading(true)
    const temporaryID = `local_${Date.now()}`
    setAssets((current) => [
      {
        createdAt: new Date().toISOString(),
        fileName: file.name,
        mediaAssetId: temporaryID,
        size: file.size,
        status: 'uploading',
      },
      ...current,
    ])

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 500))
      const sessionResponse = await fetch('/api/demo/uploads', {
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const session = await responseJSON<{
        asset: MediaAssetSummary
        uploadSessionId: string
        uploadURL: string
      }>(sessionResponse)
      setAssets((current) =>
        current.map((item) => (item.mediaAssetId === temporaryID ? session.asset : item)),
      )

      const uploadBody = new FormData()
      uploadBody.set('file', file)
      const uploadResponse = await fetch(session.uploadURL, { body: uploadBody, method: 'PUT' })
      const completed = await responseJSON<{ asset: MediaAssetSummary }>(uploadResponse)
      setAssets((current) =>
        current.map((item) =>
          item.mediaAssetId === session.asset.mediaAssetId ? completed.asset : item,
        ),
      )
    } catch (caught) {
      setAssets((current) => current.filter(({ mediaAssetId }) => mediaAssetId !== temporaryID))
      setError(caught instanceof Error ? caught.message : 'Unable to upload this video.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="media-library" aria-labelledby="media-library-title">
      <div className="media-library__heading">
        <div>
          <p className="eyebrow">
            <span aria-hidden="true" />
            Uploader-private
          </p>
          <h2 id="media-library-title">Media Assets</h2>
        </div>
        <form
          className="upload-form"
          onSubmit={(event) => {
            event.preventDefault()
            void upload(new FormData(event.currentTarget))
          }}
        >
          <label htmlFor="video-file">Video file</label>
          <input
            accept="video/mp4,.mp4,video/x-matroska,.mkv"
            id="video-file"
            name="file"
            required
            type="file"
          />
          <button className="primary-action" disabled={!hydrated || uploading} type="submit">
            {uploading ? 'Uploading…' : 'Upload asset'}
          </button>
        </form>
      </div>

      {error && (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading your private library…</p>
      ) : assets.length === 0 ? (
        <p>Your library is empty.</p>
      ) : (
        <div className="asset-list" aria-live="polite">
          {assets.map((asset) => (
            <article aria-label={asset.fileName} className="asset-card" key={asset.mediaAssetId}>
              <div>
                <h3>{asset.fileName}</h3>
                <p>{readableBytes(asset.size)}</p>
              </div>
              <strong className={`asset-status asset-status--${asset.status}`}>
                {asset.status}
              </strong>
              {!asset.mediaAssetId.startsWith('local_') && (
                <Link className="text-link" href={`/demo/assets/${asset.mediaAssetId}`}>
                  Inspect asset
                </Link>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
