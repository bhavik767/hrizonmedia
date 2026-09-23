'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

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

interface UploadOrganisation {
  defaultRetentionDays: number
  drmDefault: 'protected' | 'standard'
  drmRequired: boolean
  id: number
  maximumUploadSizeBytes: number
  name: string
}

const PENDING_UPLOAD_PREFIX = 'hrizonmedia.pending-upload.v1:'
const MAX_PART_ATTEMPTS = 3
const UPLOAD_CONCURRENCY = 3
const MIN_VISIBLE_STATUS_MS = 2_000

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

function base64ToHex(value: string): string {
  return [...window.atob(value)]
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
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
  const checksumSHA256 = await sha256(bytes)
  for (let attempt = 1; attempt <= MAX_PART_ATTEMPTS; attempt += 1) {
    try {
      const target = await responseJSON<PartUploadTarget>(
        await fetch(targetURL, {
          body: JSON.stringify({ checksumSHA256, size: bytes.size }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
      )
      const response = await fetch(target.uploadURL, {
        body: bytes,
        headers: target.headers,
        method: 'PUT',
      })
      if (response.ok) {
        if (response.headers.get('content-type')?.includes('application/json')) {
          return responseJSON<CompletedPart>(response)
        }
        const etag = response.headers.get('etag')?.replace(/^"|"$/g, '')
        const providerChecksum = response.headers.get('x-amz-checksum-sha256')
        if (!etag || !providerChecksum || base64ToHex(providerChecksum) !== checksumSHA256) {
          throw new Error('Storage did not return a verifiable upload receipt.')
        }
        return {
          checksumSHA256,
          etag,
          partNumber: Number(targetURL.split('/').at(-1)),
          size: bytes.size,
        }
      }
      if (response.status < 500) {
        throw new MediaRequestError('Storage rejected an upload part.', response.status)
      }
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

export function MediaLibrary({
  uploadOrganisations,
}: {
  uploadOrganisations: UploadOrganisation[]
}) {
  const [assets, setAssets] = useState<DisplayedAsset[]>([])
  const [error, setError] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedOrganisationID, setSelectedOrganisationID] = useState(
    () => uploadOrganisations[0]?.id ?? 0,
  )

  const selectedOrganisation =
    uploadOrganisations.find(({ id }) => id === selectedOrganisationID) ?? uploadOrganisations[0]

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

  const hasActiveProcessing = assets.some(
    ({ status }) => status === 'queued' || status === 'processing',
  )

  useEffect(() => {
    if (uploading || !hasActiveProcessing) return

    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      try {
        await refresh()
      } catch {
        // The next poll can recover from a transient request failure.
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 2_000)
    }
    timer = window.setTimeout(() => void poll(), 2_000)

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [hasActiveProcessing, refresh, uploading])

  async function upload(formData: FormData) {
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return

    setError('')
    setProgress(0)
    setUploading(true)
    const fingerprint = await fileFingerprint(file)
    if (!selectedOrganisation) {
      setError('Complete Organisation setup before uploading Media Assets.')
      setProgress(null)
      setUploading(false)
      return
    }
    if (file.size > selectedOrganisation.maximumUploadSizeBytes) {
      setError("The video exceeds this Organisation's upload limit.")
      setProgress(null)
      setUploading(false)
      return
    }
    const temporaryID = `local_${Date.now()}`
    let session: UploadSessionResponse | null = null

    flushSync(() => {
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
    })

    try {
      await new Promise((resolve) => window.setTimeout(resolve, MIN_VISIBLE_STATUS_MS))
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
        const sessionResponse = await fetch('/api/demo/uploads', {
          body: JSON.stringify({
            fileFingerprint: fingerprint,
            fileName: file.name,
            mediaProtectionPolicy: formData.get('mediaProtectionPolicy'),
            mimeType: file.type,
            organisationID: selectedOrganisation.id,
            retentionDays: Number(formData.get('retentionDays')),
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
      const missingPartNumbers: number[] = []
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
        missingPartNumbers.push(partNumber)
      }
      let nextPartIndex = 0
      const uploadNextPart = async () => {
        while (nextPartIndex < missingPartNumbers.length) {
          const partNumber = missingPartNumbers[nextPartIndex++]!
          const start = (partNumber - 1) * session!.partSize
          const targetURL = session!.partTargetURL.replace('{partNumber}', String(partNumber))
          const part = await uploadPartWithRetry(
            targetURL,
            file.slice(start, start + session!.partSize),
          )
          completed.set(partNumber, part)
          session!.completedParts = [...completed.values()].sort(
            (left, right) => left.partNumber - right.partNumber,
          )
          persistPendingUpload(session!, fingerprint)
          setProgress(Math.round((completed.size / totalParts) * 100))
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, missingPartNumbers.length) }, () =>
          uploadNextPart(),
        ),
      )

      const completeResponse = await fetch(session.completeURL, {
        body: JSON.stringify({ parts: session.completedParts }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const completedUpload = await responseJSON<{ asset: MediaAssetSummary }>(completeResponse)
      window.localStorage.removeItem(pendingUploadKey(fingerprint))
      flushSync(() => {
        setAssets((current) =>
          current.map((item) =>
            item.mediaAssetId === session!.asset.mediaAssetId ? completedUpload.asset : item,
          ),
        )
      })
      await new Promise((resolve) => window.setTimeout(resolve, MIN_VISIBLE_STATUS_MS))
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
            Organisation-scoped
          </p>
          <h2 id="media-library-title">Media Assets</h2>
        </div>
        {uploadOrganisations.length > 0 && (
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
            {uploadOrganisations.length > 1 && (
              <>
                <label htmlFor="upload-organisation">Organisation</label>
                <select
                  id="upload-organisation"
                  onChange={(event) => setSelectedOrganisationID(Number(event.target.value))}
                  value={selectedOrganisation?.id ?? ''}
                >
                  {uploadOrganisations.map((organisation) => (
                    <option key={organisation.id} value={organisation.id}>
                      {organisation.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label htmlFor="media-protection-policy">Media Protection Policy</label>
            <select
              defaultValue={selectedOrganisation?.drmDefault ?? 'protected'}
              disabled={selectedOrganisation?.drmRequired ?? false}
              id="media-protection-policy"
              key={selectedOrganisation?.id}
              name="mediaProtectionPolicy"
            >
              <option value="protected">DRM-protected playback</option>
              <option value="standard">Standard playback</option>
            </select>
            {selectedOrganisation?.drmRequired && (
              <input name="mediaProtectionPolicy" type="hidden" value="protected" />
            )}
            <label htmlFor="retention-days">Retention period (days)</label>
            <input
              defaultValue={selectedOrganisation?.defaultRetentionDays ?? 1}
              id="retention-days"
              key={`retention-${selectedOrganisation?.id}`}
              max={selectedOrganisation?.defaultRetentionDays ?? 1}
              min="1"
              name="retentionDays"
              required
              type="number"
            />
            <button className="primary-action" disabled={!hydrated || uploading} type="submit">
              {uploading ? `Uploading${progress === null ? '…' : ` ${progress}%`}` : 'Upload asset'}
            </button>
          </form>
        )}
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
