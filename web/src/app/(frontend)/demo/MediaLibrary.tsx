'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

import type { CompletedPart, PartUploadTarget } from '@/media/multipart'
import {
  mediaAssetStatuses,
  type MediaAssetStatus,
  type MediaAssetSummary,
  type MediaFolderSummary,
} from '@/media/types'

type DisplayedAsset = Omit<MediaAssetSummary, 'mediaAssetId'> & { mediaAssetId: string }
type DateRange = 'all' | '7' | '30' | '90'
type StatusFilter = 'all' | MediaAssetStatus

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

interface LibraryOrganisation {
  id: number
  name: string
}

const PENDING_UPLOAD_PREFIX = 'hrizonmedia.pending-upload.v1:'
const MAX_PART_ATTEMPTS = 3
const UPLOAD_CONCURRENCY = 3
const MIN_VISIBLE_STATUS_MS = 2_000
const dateRanges: readonly DateRange[] = ['all', '7', '30', '90']

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

function readableUploadLimit(bytes: number): string {
  const gigabyte = 1024 * 1024 * 1024
  return bytes >= gigabyte
    ? `${(bytes / gigabyte).toFixed(1)} GB`
    : `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

function isSupportedVideo(file: File): boolean {
  return /\.(mp4|mkv)$/i.test(file.name)
}

function readableDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

function readableDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return 'Pending'
  const wholeSeconds = Math.floor(seconds)
  const hours = Math.floor(wholeSeconds / 3_600)
  const minutes = Math.floor((wholeSeconds % 3_600) / 60)
  const remainder = wholeSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function isDateRange(value: string): value is DateRange {
  return dateRanges.includes(value as DateRange)
}

function isStatusFilter(value: string): value is StatusFilter {
  return value === 'all' || mediaAssetStatuses.includes(value as MediaAssetStatus)
}

function isWithinDateRange(createdAt: string, range: DateRange): boolean {
  if (range === 'all') return true
  const days = Number(range)
  return new Date(createdAt).getTime() >= Date.now() - days * 24 * 60 * 60 * 1_000
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
  libraryOrganisations,
  uploadOrganisations,
}: {
  libraryOrganisations: LibraryOrganisation[]
  uploadOrganisations: UploadOrganisation[]
}) {
  const [assets, setAssets] = useState<DisplayedAsset[]>([])
  const [error, setError] = useState('')
  const [folders, setFolders] = useState<MediaFolderSummary[]>([])
  const [activeFolderID, setActiveFolderID] = useState<number | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<number | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDialogError, setUploadDialogError] = useState('')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [selectedOrganisationID, setSelectedOrganisationID] = useState(
    () => uploadOrganisations[0]?.id ?? libraryOrganisations[0]?.id ?? 0,
  )
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [view, setView] = useState<'grid' | 'list'>('list')

  const selectedOrganisation =
    libraryOrganisations.find(({ id }) => id === selectedOrganisationID) ?? libraryOrganisations[0]
  const selectedUploadOrganisation = uploadOrganisations.find(
    ({ id }) => id === selectedOrganisation?.id,
  )

  const refresh = useCallback(async (organisationID: number) => {
    const response = await fetch(`/api/demo/assets?organisationID=${organisationID}`, {
      cache: 'no-store',
    })
    const result = await responseJSON<{ assets: MediaAssetSummary[] }>(response)
    setAssets(result.assets)
    setLoading(false)
  }, [])

  const refreshFolders = useCallback(async (organisationID: number) => {
    const response = await fetch(`/api/demo/folders?organisationID=${organisationID}`, {
      cache: 'no-store',
    })
    const result = await responseJSON<{ folders: MediaFolderSummary[] }>(response)
    setFolders(result.folders)
  }, [])

  useEffect(() => setHydrated(true), [])

  useEffect(() => {
    if (window.location.hash === '#upload' && selectedUploadOrganisation) {
      setUploadDialogOpen(true)
    }
  }, [selectedUploadOrganisation])

  useEffect(() => {
    if (!uploadDialogOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUploadDialogOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [uploadDialogOpen])

  useEffect(() => {
    if (!selectedOrganisation) return
    void refresh(selectedOrganisation.id).catch((caught: Error) => {
      setError(caught.message)
      setLoading(false)
    })
  }, [refresh, selectedOrganisation])

  useEffect(() => {
    if (!selectedOrganisation) return
    void refreshFolders(selectedOrganisation.id).catch((caught: Error) => setError(caught.message))
  }, [refreshFolders, selectedOrganisation])

  const hasActiveProcessing = assets.some(
    ({ status }) => status === 'queued' || status === 'processing',
  )

  useEffect(() => {
    if (uploading || !hasActiveProcessing) return

    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      try {
        if (selectedOrganisation) await refresh(selectedOrganisation.id)
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
  }, [hasActiveProcessing, refresh, selectedOrganisation, uploading])

  async function upload(formData: FormData) {
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return

    setError('')
    setProgress(0)
    setUploading(true)
    const fingerprint = await fileFingerprint(file)
    if (!selectedUploadOrganisation) {
      setError('Complete Organisation setup before uploading Media Assets.')
      setProgress(null)
      setUploading(false)
      return
    }
    if (file.size > selectedUploadOrganisation.maximumUploadSizeBytes) {
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
            organisationID: selectedUploadOrganisation.id,
            folderID: formData.get('folderID') ? Number(formData.get('folderID')) : undefined,
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

  function chooseVideo(file: File | undefined): void {
    setUploadDialogError('')
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (!isSupportedVideo(file)) {
      setSelectedFile(null)
      setUploadDialogError('Choose an MP4 or MKV video.')
      return
    }
    if (
      selectedUploadOrganisation &&
      file.size > selectedUploadOrganisation.maximumUploadSizeBytes
    ) {
      setSelectedFile(null)
      setUploadDialogError(
        `Choose a video no larger than ${readableUploadLimit(selectedUploadOrganisation.maximumUploadSizeBytes)}.`,
      )
      return
    }
    setSelectedFile(file)
  }

  function closeUploadDialog(): void {
    setUploadDialogOpen(false)
    setSelectedFile(null)
    setUploadDialogError('')
    if (window.location.hash === '#upload') {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`)
    }
  }

  async function createFolder(formData: FormData) {
    if (!selectedOrganisation) return
    try {
      const result = await responseJSON<{ folder: MediaFolderSummary }>(
        await fetch('/api/demo/folders', {
          body: JSON.stringify({
            name: formData.get('name'),
            organisationID: selectedOrganisation.id,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
      )
      setFolders((current) =>
        [...current, result.folder].sort((left, right) => left.name.localeCompare(right.name)),
      )
      setActiveFolderID(result.folder.id)
      setCreateFolderOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create Folder.')
    }
  }

  async function renameActiveFolder() {
    const folder = folders.find(({ id }) => id === activeFolderID)
    const name = folder && window.prompt('Folder name', folder.name)
    if (!folder || !name) return
    try {
      const result = await responseJSON<{ folder: MediaFolderSummary }>(
        await fetch(`/api/demo/folders/${folder.id}`, {
          body: JSON.stringify({ name }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        }),
      )
      setFolders((current) => current.map((item) => (item.id === folder.id ? result.folder : item)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to rename Folder.')
    }
  }

  async function deleteActiveFolder() {
    if (
      activeFolderID === null ||
      !window.confirm('Move this Folder’s Media Assets to All Videos?')
    )
      return
    try {
      const response = await fetch(`/api/demo/folders/${activeFolderID}`, { method: 'DELETE' })
      if (!response.ok) await responseJSON(response)
      setAssets((current) =>
        current.map((asset) =>
          asset.folderID === activeFolderID ? { ...asset, folderID: null } : asset,
        ),
      )
      setFolders((current) => current.filter(({ id }) => id !== activeFolderID))
      setActiveFolderID(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete Folder.')
    }
  }

  async function moveAsset(mediaAssetId: string, folderID: number | null) {
    try {
      const result = await responseJSON<{ asset: MediaAssetSummary }>(
        await fetch(`/api/demo/assets/${mediaAssetId}`, {
          body: JSON.stringify({ folderID }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        }),
      )
      setAssets((current) =>
        current.map((asset) => (asset.mediaAssetId === mediaAssetId ? result.asset : asset)),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to move Media Asset.')
    }
  }

  const visibleAssets = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    return assets.filter((asset) => {
      const matchesFolder = activeFolderID === null || asset.folderID === activeFolderID
      const matchesSearch =
        normalizedSearch.length === 0 ||
        asset.fileName.toLocaleLowerCase().includes(normalizedSearch)
      const matchesStatus = status === 'all' || asset.status === status
      return (
        matchesFolder &&
        matchesSearch &&
        matchesStatus &&
        isWithinDateRange(asset.createdAt, dateRange)
      )
    })
  }, [activeFolderID, assets, dateRange, search, status])

  return (
    <section className="media-library" aria-labelledby="media-library-title">
      <div className="media-library__heading">
        <div>
          <p className="eyebrow">
            <span aria-hidden="true" />
            Organisation-scoped
          </p>
          <h2 id="media-library-title">Video library</h2>
        </div>
        {selectedUploadOrganisation && (
          <div className="media-library__actions">
            <button className="secondary-action" disabled type="button">
              Import
            </button>
            <button
              className="primary-action"
              disabled={!hydrated || uploading}
              onClick={() => setUploadDialogOpen(true)}
              type="button"
            >
              {uploading ? `Uploading${progress === null ? '…' : ` ${progress}%`}` : 'Upload Video'}
            </button>
          </div>
        )}
      </div>

      {selectedUploadOrganisation && uploadDialogOpen && (
        <div className="upload-dialog-backdrop" onMouseDown={closeUploadDialog}>
          <div
            aria-labelledby="upload-dialog-title"
            aria-modal="true"
            className="upload-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="upload-dialog__heading">
              <div>
                <p className="eyebrow">
                  <span aria-hidden="true" /> Secure ingestion
                </p>
                <h2 id="upload-dialog-title">Upload Video</h2>
                <p>to {selectedUploadOrganisation.name}</p>
              </div>
              <button aria-label="Close upload dialog" onClick={closeUploadDialog} type="button">
                ×
              </button>
            </div>

            <form
              className="upload-dialog__form"
              onSubmit={(event) => {
                event.preventDefault()
                if (!selectedFile) return
                const formData = new FormData(event.currentTarget)
                formData.set('file', selectedFile)
                closeUploadDialog()
                void upload(formData)
              }}
            >
              <label
                className="upload-dropzone"
                htmlFor="video-file"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  chooseVideo(event.dataTransfer.files[0])
                }}
              >
                <input
                  accept="video/mp4,.mp4,video/x-matroska,.mkv"
                  aria-label="Video file"
                  id="video-file"
                  onChange={(event) => chooseVideo(event.currentTarget.files?.[0])}
                  type="file"
                />
                <span aria-hidden="true" className="upload-dropzone__icon">
                  ↑
                </span>
                <strong>{selectedFile ? selectedFile.name : 'Drop MP4 or MKV video here'}</strong>
                <span>
                  {selectedFile
                    ? `${readableBytes(selectedFile.size)} selected`
                    : `or click to browse · ${readableUploadLimit(selectedUploadOrganisation.maximumUploadSizeBytes)} maximum`}
                </span>
              </label>

              {uploadDialogError && (
                <p className="form-message form-message--error" role="alert">
                  {uploadDialogError}
                </p>
              )}

              <div className="upload-dialog__fields">
                {uploadOrganisations.length > 1 && (
                  <label>
                    <span>Organisation</span>
                    <select
                      onChange={(event) => setSelectedOrganisationID(Number(event.target.value))}
                      value={selectedOrganisation?.id ?? ''}
                    >
                      {uploadOrganisations.map((organisation) => (
                        <option key={organisation.id} value={organisation.id}>
                          {organisation.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <span>Destination folder</span>
                  <select defaultValue={activeFolderID ?? ''} name="folderID">
                    <option value="">All Videos</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Media Protection Policy</span>
                  <select
                    defaultValue={selectedUploadOrganisation.drmDefault}
                    disabled={selectedUploadOrganisation.drmRequired}
                    key={selectedUploadOrganisation.id}
                    name="mediaProtectionPolicy"
                  >
                    <option value="protected">DRM-protected playback</option>
                    <option value="standard">Standard playback</option>
                  </select>
                </label>
                {selectedUploadOrganisation.drmRequired && (
                  <input name="mediaProtectionPolicy" type="hidden" value="protected" />
                )}
                <label>
                  <span>Retention period (days)</span>
                  <input
                    defaultValue={selectedUploadOrganisation.defaultRetentionDays}
                    key={`retention-${selectedUploadOrganisation.id}`}
                    max={selectedUploadOrganisation.defaultRetentionDays}
                    min="1"
                    name="retentionDays"
                    required
                    type="number"
                  />
                </label>
              </div>

              <p className="upload-dialog__processing-note">
                Adaptive playback renditions are prepared automatically after upload.
              </p>
              <div className="upload-dialog__actions">
                <button className="secondary-action" onClick={closeUploadDialog} type="button">
                  Cancel
                </button>
                <button className="primary-action" disabled={!selectedFile} type="submit">
                  Start Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedOrganisation && (
        <div className="media-library__folders" aria-label="Media Library Folders">
          <button
            aria-pressed={activeFolderID === null}
            className="folder-strip__item"
            onClick={() => setActiveFolderID(null)}
            type="button"
          >
            All Videos
          </button>
          {folders.map((folder) => (
            <button
              aria-pressed={activeFolderID === folder.id}
              className="folder-strip__item"
              key={folder.id}
              onClick={() => setActiveFolderID(folder.id)}
              type="button"
            >
              {folder.name}
            </button>
          ))}
          <button
            aria-expanded={createFolderOpen}
            className="folder-strip__create"
            onClick={() => setCreateFolderOpen((open) => !open)}
            type="button"
          >
            Create Folder
          </button>
          {activeFolderID !== null && (
            <>
              <button
                className="folder-strip__action"
                onClick={() => void renameActiveFolder()}
                type="button"
              >
                Rename Folder
              </button>
              <button
                className="folder-strip__action"
                onClick={() => void deleteActiveFolder()}
                type="button"
              >
                Delete Folder
              </button>
            </>
          )}
        </div>
      )}

      {createFolderOpen && (
        <form
          className="folder-create-form"
          onSubmit={(event) => {
            event.preventDefault()
            void createFolder(new FormData(event.currentTarget))
            event.currentTarget.reset()
          }}
        >
          <label htmlFor="folder-name">Folder name</label>
          <input id="folder-name" name="name" required type="text" />
          <button className="primary-action" type="submit">
            Save Folder
          </button>
        </form>
      )}

      <div className="media-library__controls" aria-label="Media Asset filters">
        <label>
          <span>Search</span>
          <input
            aria-label="Search Media Assets"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search videos"
            type="search"
            value={search}
          />
        </label>
        <label>
          <span>Status</span>
          <select
            aria-label="Status"
            onChange={(event) => {
              if (isStatusFilter(event.target.value)) setStatus(event.target.value)
            }}
            value={status}
          >
            <option value="all">All statuses</option>
            <option value="uploading">Uploading</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="ready">Ready</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </select>
        </label>
        <label>
          <span>Uploaded</span>
          <select
            aria-label="Upload date"
            onChange={(event) => {
              if (isDateRange(event.target.value)) setDateRange(event.target.value)
            }}
            value={dateRange}
          >
            <option value="all">Any time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </label>
        <div aria-label="Display format" className="view-toggle" role="group">
          <button aria-pressed={view === 'grid'} onClick={() => setView('grid')} type="button">
            Grid view
          </button>
          <button aria-pressed={view === 'list'} onClick={() => setView('list')} type="button">
            List view
          </button>
        </div>
      </div>

      {error && (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading your private library…</p>
      ) : visibleAssets.length === 0 ? (
        <p>
          {assets.length === 0 ? 'Your library is empty.' : 'No Media Assets match these filters.'}
        </p>
      ) : (
        <div
          aria-label="Media Asset results"
          aria-live="polite"
          className={`asset-list asset-list--${view}`}
          data-view={view}
          role="region"
        >
          {visibleAssets.map((asset) => {
            const isTemporaryAsset = asset.mediaAssetId.startsWith('local_')
            const thumbnail = (
              <>
                {asset.status === 'ready' && !isTemporaryAsset ? (
                  // The thumbnail endpoint requires the member's browser session; Next's image optimizer cannot forward it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`Thumbnail for ${asset.fileName}`}
                    className="asset-card__thumbnail-image"
                    src={`/api/demo/assets/${asset.mediaAssetId}/thumbnail`}
                  />
                ) : (
                  <>
                    <span aria-hidden="true">▶</span>
                    <span className="asset-card__thumbnail-label">{asset.fileName}</span>
                  </>
                )}
              </>
            )

            return (
              <article aria-label={asset.fileName} className="asset-card" key={asset.mediaAssetId}>
                {isTemporaryAsset ? (
                  <div aria-hidden="true" className="asset-card__thumbnail">
                    {thumbnail}
                  </div>
                ) : (
                  <Link
                    aria-label={`Open ${asset.fileName}`}
                    className="asset-card__thumbnail"
                    href={`/demo/assets/${asset.mediaAssetId}`}
                  >
                    {thumbnail}
                  </Link>
                )}
                <div className="asset-card__details">
                  {isTemporaryAsset ? (
                    <h3>{asset.fileName}</h3>
                  ) : (
                    <Link href={`/demo/assets/${asset.mediaAssetId}`}>{asset.fileName}</Link>
                  )}
                  <p>Uploaded {readableDate(asset.createdAt)}</p>
                  <p>Duration {readableDuration(asset.durationSeconds)}</p>
                  <p>{readableBytes(asset.size)}</p>
                </div>
                <div className="asset-card__actions">
                  <strong className={`asset-status asset-status--${asset.status}`}>
                    {asset.status}
                  </strong>
                  {!isTemporaryAsset && (
                    <select
                      aria-label={`Folder for ${asset.fileName}`}
                      onChange={(event) =>
                        void moveAsset(
                          asset.mediaAssetId,
                          event.target.value ? Number(event.target.value) : null,
                        )
                      }
                      value={asset.folderID ?? ''}
                    >
                      <option value="">All Videos</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {!isTemporaryAsset && (
                    <Link className="asset-card__open" href={`/demo/assets/${asset.mediaAssetId}`}>
                      Inspect asset
                    </Link>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
