'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import type { CompletedPart, PartUploadTarget } from '@/media/multipart'
import type { MediaAssetSummary } from '@/media/types'

type DisplayedAsset = Omit<MediaAssetSummary, 'mediaAssetId'> & { mediaAssetId: string }

interface UploadSessionResponse {
  asset: DisplayedAsset
  completeURL: string
  completedParts: CompletedPart[]
  expiresAt: string
  partSize: number
  partTargetURL: string
  uploadSessionId: string
}

const PENDING_UPLOAD_PREFIX = 'hrizonmedia.pending-upload.v1:'
const MAX_PART_ATTEMPTS = 3

class MediaRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function responseJSON<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new MediaRequestError(body.error || 'The media request failed.', response.status)
  }
  return body
}

async function fileFingerprint(file: File): Promise<string> {
  const sampleSize = 64 * 1024
  const sample =
    file.size <= sampleSize * 2
      ? await file.arrayBuffer()
      : await new Blob([file.slice(0, sampleSize), file.slice(-sampleSize)]).arrayBuffer()
  const hash = await sha256(new Blob([sample]))
  return `${file.name}:${file.size}:${hash}`
}

async function sha256(bytes: Blob): Promise<string> {
  const digest = await window.crypto.subtle.digest('SHA-256', await bytes.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function pendingUploadKey(fingerprint: string): string {
  return `${PENDING_UPLOAD_PREFIX}${fingerprint}`
}

function readPendingUpload(fingerprint: string): UploadSessionResponse | null {
  try {
    const stored = window.localStorage.getItem(pendingUploadKey(fingerprint))
    if (!stored) return null
    return JSON.parse(stored) as UploadSessionResponse
  } catch {
    window.localStorage.removeItem(pendingUploadKey(fingerprint))
    return null
  }
}

function persistPendingUpload(session: UploadSessionResponse, fingerprint: string): void {
  window.localStorage.setItem(pendingUploadKey(fingerprint), JSON.stringify(session))
}

async function uploadPartWithRetry(targetURL: string, bytes: Blob): Promise<CompletedPart> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_PART_ATTEMPTS; attempt += 1) {
    try {
      const target = await responseJSON<PartUploadTarget>(
        await fetch(targetURL, { method: 'POST' }),
      )
      const response = await fetch(target.uploadURL, {
        body: bytes,
        headers: target.headers,
        method: 'PUT',
      })
      if (response.ok || response.status < 500) return responseJSON<CompletedPart>(response)
      lastError = new Error('A storage part failed temporarily.')
    } catch (error) {
      if (error instanceof MediaRequestError && error.status < 500) throw error
      lastError = error instanceof Error ? error : new Error('A storage part failed temporarily.')
    }
    if (attempt < MAX_PART_ATTEMPTS) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt * 150))
    }
  }
  throw new Error(`${lastError?.message || 'A storage part failed.'} Reselect this file to resume.`)
}

export function MediaLibrary() {
  const [assets, setAssets] = useState<DisplayedAsset[]>([])
  const [error, setError] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/demo/assets', { cache: 'no-store' })
    const result = await responseJSON<{ assets: MediaAssetSummary[] }>(response)
    setAssets(result.assets)
    setLoading(false)
  }, [])

  useEffect(() => setHydrated(true), [])

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
    setProgress(0)
    setUploading(true)
    const fingerprint = await fileFingerprint(file)
    const temporaryID = `local_${Date.now()}`
    let session: UploadSessionResponse | null = null

    try {
      const pending = readPendingUpload(fingerprint)
      if (pending) {
        const resumeResponse = await fetch(
          `/api/demo/uploads/${pending.uploadSessionId}?fileFingerprint=${encodeURIComponent(fingerprint)}`,
          { cache: 'no-store' },
        )
        if (resumeResponse.status === 409 || resumeResponse.status === 410) {
          window.localStorage.removeItem(pendingUploadKey(fingerprint))
        }
        session = await responseJSON<UploadSessionResponse>(resumeResponse)
      } else {
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
        const sessionResponse = await fetch('/api/demo/uploads', {
          body: JSON.stringify({
            fileFingerprint: fingerprint,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        })
        session = await responseJSON<UploadSessionResponse>(sessionResponse)
      }

      persistPendingUpload(session, fingerprint)
      setAssets((current) => {
        const withoutTemporary = current.filter(({ mediaAssetId }) => mediaAssetId !== temporaryID)
        return withoutTemporary.some(
          ({ mediaAssetId }) => mediaAssetId === session!.asset.mediaAssetId,
        )
          ? withoutTemporary
          : [session!.asset, ...withoutTemporary]
      })

      const completed = new Map(session.completedParts.map((part) => [part.partNumber, part]))
      const totalParts = Math.ceil(file.size / session.partSize)
      setProgress(Math.round((completed.size / totalParts) * 100))
      for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
        const start = (partNumber - 1) * session.partSize
        const bytes = file.slice(start, start + session.partSize)
        const existing = completed.get(partNumber)
        if (existing) {
          if ((await sha256(bytes)) !== existing.checksumSHA256) {
            throw new Error('The selected file does not match the completed upload parts.')
          }
          continue
        }
        const targetURL = session.partTargetURL.replace('{partNumber}', String(partNumber))
        const part = await uploadPartWithRetry(targetURL, bytes)
        completed.set(partNumber, part)
        session.completedParts = [...completed.values()].sort(
          (left, right) => left.partNumber - right.partNumber,
        )
        persistPendingUpload(session, fingerprint)
        setProgress(Math.round((completed.size / totalParts) * 100))
      }

      const completeResponse = await fetch(session.completeURL, {
        body: JSON.stringify({ parts: session.completedParts }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const completedUpload = await responseJSON<{ asset: MediaAssetSummary }>(completeResponse)
      window.localStorage.removeItem(pendingUploadKey(fingerprint))
      setAssets((current) =>
        current.map((item) =>
          item.mediaAssetId === session!.asset.mediaAssetId ? completedUpload.asset : item,
        ),
      )
    } catch (caught) {
      setAssets((current) => current.filter(({ mediaAssetId }) => mediaAssetId !== temporaryID))
      setError(caught instanceof Error ? caught.message : 'Unable to upload this video.')
    } finally {
      setProgress(null)
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
            {uploading ? `Uploading${progress === null ? '…' : ` ${progress}%`}` : 'Upload asset'}
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
