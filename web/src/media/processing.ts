import 'server-only'

import { randomUUID } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest, Where } from 'payload'

import type { MediaAsset, ProcessingJob } from '@/payload-types'
import { recordAuditEvent } from '@/audit/events'
import { getOperationalControls } from '@/organisations/operations'

import {
  processingOutputPrefix,
  type MediaAssetId,
  type ProcessingJobId,
  type ProviderJobId,
} from './identifiers'
import { InvalidTranscodeMetadataError, PermanentTranscodeError } from './providers/errors'
import { getMediaProviders } from './providers'
import { logMediaDiagnostic } from './diagnostics'
import type {
  Rendition,
  SourceMedia,
  StorageProvider,
  TranscodeProvider,
} from './providers/contracts'

const DISPATCH_DEADLINE_MS = 30_000
const LEASE_DURATION_MS = 30_000
const PROCESSING_OVERHEAD_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 1_000

const FAILURE_MESSAGE =
  'Processing could not be completed. You can retry while the source is available.'

export interface ProcessingOptions {
  now?: Date
  provider?: TranscodeProvider
  storage?: StorageProvider
  workerId?: string
}

function relationID(value: number | { id: number }): number {
  return typeof value === 'number' ? value : value.id
}

function sourceFor(job: ProcessingJob): SourceMedia {
  return {
    durationSeconds: job.sourceDurationSeconds,
    height: job.sourceHeight,
    width: job.sourceWidth,
  }
}

function renditionsFor(job: ProcessingJob): Rendition[] {
  return job.renditions as Rendition[]
}

export function adaptiveRenditions(source: SourceMedia): Rendition[] {
  const widths =
    source.height < 360
      ? new Map([
          [240, 426],
          [270, 480],
        ])
      : new Map([
          [360, 640],
          [480, 854],
          [720, 1280],
          [1080, 1920],
        ])
  return [...widths]
    .filter(([height]) => height <= source.height)
    .map(([height, standardWidth]) => {
      const scale = Math.min(height / source.height, standardWidth / source.width, 1)
      const scaledWidth = Math.round((source.width * scale) / 2) * 2
      return {
        audioCodec: 'aac' as const,
        height: height as Rendition['height'],
        videoCodec: 'h264' as const,
        width: scaledWidth,
      }
    })
}

export function newProcessingJobData(input: {
  asset: MediaAsset
  objectKey: string
  ownerID: number
  processingJobId: ProcessingJobId
  queuedAt: Date
  source: SourceMedia
}) {
  return {
    asset: input.asset.id,
    attempts: 0,
    dispatchBy: new Date(input.queuedAt.getTime() + DISPATCH_DEADLINE_MS).toISOString(),
    nextAttemptAt: input.queuedAt.toISOString(),
    objectKey: input.objectKey,
    organisation:
      typeof input.asset.organisation === 'number'
        ? input.asset.organisation
        : input.asset.organisation?.id,
    owner: input.ownerID,
    processingJobId: input.processingJobId,
    queuedAt: input.queuedAt.toISOString(),
    renditions: adaptiveRenditions(input.source),
    sourceDurationSeconds: input.source.durationSeconds,
    sourceHeight: input.source.height,
    sourceWidth: input.source.width,
    status: 'queued' as const,
  }
}

export async function setProcessingAssetStatus(
  payload: Payload,
  job: ProcessingJob,
  status: 'queued' | 'processing' | 'ready' | 'failed',
  now: Date,
  req?: PayloadRequest,
  playReadyPackaged = false,
) {
  const asset = await payload.findByID({
    collection: 'media-assets',
    depth: 0,
    id: relationID(job.asset),
    overrideAccess: true,
  })
  const playbackData =
    status === 'ready'
      ? {
          drmContentId: `drm_${job.processingJobId}`,
          expiresAt:
            asset.expiresAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          playReadyPackaged,
        }
      : {}
  await payload.update({
    collection: 'media-assets',
    data: { ...playbackData, status, statusChangedAt: now.toISOString() },
    id: relationID(job.asset),
    overrideAccess: true,
    req,
  })
  const action =
    status === 'processing'
      ? 'processing_dispatched'
      : status === 'ready'
        ? 'processing_ready'
        : status === 'failed'
          ? 'processing_failed'
          : 'processing_retried'
  await recordAuditEvent(payload, {
    action,
    assetID: relationID(job.asset),
    eventKey: `processing-job:${job.processingJobId}:${action}:${status === 'ready' ? 'final' : job.attempts}`,
    occurredAt: now,
    req,
  })
}

export async function failProcessingJob(
  payload: Payload,
  job: ProcessingJob,
  now: Date,
  code: string,
  req?: PayloadRequest,
) {
  await payload.update({
    collection: 'processing-jobs',
    data: {
      failedAt: now.toISOString(),
      failureCode: code,
      failureMessage: FAILURE_MESSAGE,
      leaseToken: null,
      leasedUntil: null,
      status: 'failed',
    },
    id: job.id,
    overrideAccess: true,
    req,
  })
  await setProcessingAssetStatus(payload, job, 'failed', now, req)
}

async function scheduleRetry(
  payload: Payload,
  job: ProcessingJob,
  now: Date,
  code: string,
  delay = true,
  req?: PayloadRequest,
) {
  if (job.attempts >= MAX_ATTEMPTS) {
    await failProcessingJob(payload, job, now, code, req)
    return
  }
  await payload.update({
    collection: 'processing-jobs',
    data: {
      failureCode: code,
      leaseToken: null,
      leasedUntil: null,
      nextAttemptAt: new Date(
        now.getTime() + (delay ? RETRY_BASE_DELAY_MS * 2 ** Math.max(0, job.attempts - 1) : 0),
      ).toISOString(),
      providerJobId: null,
      processingDeadlineAt: null,
      startedAt: null,
      status: 'queued',
    },
    id: job.id,
    overrideAccess: true,
    req,
  })
  await setProcessingAssetStatus(payload, job, 'queued', now, req)
}

export async function retryOrFailProcessingJob(
  payload: Payload,
  job: ProcessingJob,
  now: Date,
  code: string,
  req?: PayloadRequest,
) {
  await scheduleRetry(payload, job, now, code, true, req)
}

async function recoverExpiredJobs(payload: Payload, now: Date, where: Where) {
  const expired = await payload.find({
    collection: 'processing-jobs',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where,
  })
  for (const job of expired.docs) {
    logMediaDiagnostic('error', 'processing_stalled', job.id)
    await scheduleRetry(payload, job, now, 'processing_timeout', false)
  }
}

type TransactionDatabase = { execute: (query: unknown) => Promise<unknown> }

async function inTransaction<T>(
  payload: Payload,
  operation: (transaction: TransactionDatabase) => Promise<T>,
): Promise<T> {
  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null) throw new Error('Processing recovery requires transactions.')
  try {
    const transaction = payload.db.sessions?.[String(transactionID)]?.db as
      | TransactionDatabase
      | undefined
    if (!transaction) throw new Error('Unable to start the processing recovery transaction.')
    const result = await operation(transaction)
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}

async function supersedeExpiredAttempts(payload: Payload, now: Date) {
  const expired = await payload.find({
    collection: 'processing-jobs',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: {
      and: [
        { status: { equals: 'processing' } },
        { processingDeadlineAt: { less_than_equal: now.toISOString() } },
      ],
    },
  })
  for (const job of expired.docs) {
    const transition = await inTransaction(payload, async (transaction) =>
      (await transaction.execute(sql`
        UPDATE processing_jobs
        SET status = 'cancelling',
            failure_code = 'processing_timeout',
            lease_token = NULL,
            leased_until = NULL,
            updated_at = ${now}
        WHERE id = ${job.id}
          AND status = 'processing'
          AND attempts = ${job.attempts}
          AND processing_deadline_at <= ${now}
        RETURNING id
      `)) as { rows: Array<{ id?: unknown }> },
    )
    if (transition.rows[0]?.id) logMediaDiagnostic('error', 'processing_stalled', job.id)
  }
}

async function reconcileCancelledAttempts(
  payload: Payload,
  now: Date,
  provider: TranscodeProvider,
  storage: StorageProvider,
  workerId: string,
) {
  const cancelling = await payload.find({
    collection: 'processing-jobs',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: { status: { equals: 'cancelling' } },
  })
  for (const job of cancelling.docs) {
    const leaseToken = `${workerId}:cancel:${randomUUID()}`
    const leasedUntil = new Date(now.getTime() + LEASE_DURATION_MS)
    const claim = await inTransaction(payload, async (transaction) =>
      (await transaction.execute(sql`
        UPDATE processing_jobs
        SET lease_token = ${leaseToken},
            leased_until = ${leasedUntil},
            updated_at = ${now}
        WHERE id = ${job.id}
          AND status = 'cancelling'
          AND (lease_token IS NULL OR leased_until <= ${now})
        RETURNING id
      `)) as { rows: Array<{ id?: unknown }> },
    )
    if (!claim.rows[0]?.id) continue
    try {
      await provider.cancelAttempt({
        attempt: job.attempts,
        processingJobId: job.processingJobId as ProcessingJobId,
        providerJobId: job.providerJobId as ProviderJobId,
      })
      await storage.deletePrefix(`transcode-attempts/${job.processingJobId}/${job.attempts}/`)
      await storage.deletePrefix(processingOutputPrefix(job.processingJobId as ProcessingJobId))
    } catch {
      await inTransaction(payload, async (transaction) =>
        transaction.execute(sql`
          UPDATE processing_jobs
          SET lease_token = NULL,
              leased_until = NULL,
              updated_at = ${now}
          WHERE id = ${job.id}
            AND status = 'cancelling'
            AND lease_token = ${leaseToken}
        `),
      )
      logMediaDiagnostic('error', 'processing_cancellation_pending', job.id)
      continue
    }

    const finalAttempt = job.attempts >= MAX_ATTEMPTS
    const reconciled = await inTransaction(payload, async (transaction) => {
      const common = sql`
        provider_job_id = NULL,
        processing_deadline_at = NULL,
        started_at = NULL,
        lease_token = NULL,
        leased_until = NULL,
        updated_at = ${now}
      `
      return (await transaction.execute(
        finalAttempt
          ? sql`
              UPDATE processing_jobs
              SET status = 'failed',
                  failed_at = ${now},
                  failure_code = 'processing_timeout',
                  failure_message = ${FAILURE_MESSAGE},
                  ${common}
              WHERE id = ${job.id}
                AND status = 'cancelling'
                AND attempts = ${job.attempts}
                AND lease_token = ${leaseToken}
              RETURNING id
            `
          : sql`
              UPDATE processing_jobs
              SET status = 'queued',
                  next_attempt_at = ${now},
                  ${common}
              WHERE id = ${job.id}
                AND status = 'cancelling'
                AND attempts = ${job.attempts}
                AND lease_token = ${leaseToken}
              RETURNING id
            `,
      )) as { rows: Array<{ id?: unknown }> }
    })
    if (!reconciled.rows[0]?.id) continue
    await setProcessingAssetStatus(payload, job, finalAttempt ? 'failed' : 'queued', now)
  }
}

async function dispatchQueuedJobs(
  payload: Payload,
  now: Date,
  provider: TranscodeProvider,
  workerId: string,
  providerConcurrency: number,
) {
  const queued = await payload.find({
    collection: 'processing-jobs',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: {
      and: [
        { status: { equals: 'queued' } },
        { nextAttemptAt: { less_than_equal: now.toISOString() } },
      ],
    },
  })

  let dispatched = 0
  for (const candidate of queued.docs) {
    if (dispatched >= providerConcurrency) return
    const leaseToken = `${workerId}:${randomUUID()}`
    const leasedUntil = new Date(now.getTime() + LEASE_DURATION_MS)
    const transactionID = await payload.db.beginTransaction()
    if (transactionID === null) throw new Error('Provider concurrency requires transactions.')
    let claim: { rows: Array<{ id?: unknown }> }
    try {
      const transaction = payload.db.sessions?.[String(transactionID)]?.db as
        { execute: (query: unknown) => Promise<unknown> } | undefined
      if (!transaction) throw new Error('Unable to start the provider concurrency transaction.')
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(394039)`)
      claim = (await transaction.execute(sql`
        UPDATE processing_jobs
        SET status = 'dispatching',
            attempts = attempts + 1,
            lease_token = ${leaseToken},
            leased_until = ${leasedUntil},
            updated_at = ${now}
        WHERE id = ${candidate.id}
          AND status = 'queued'
          AND next_attempt_at <= ${now}
          AND (
            SELECT count(*)
            FROM processing_jobs
            WHERE status IN ('dispatching', 'processing', 'cancelling')
          ) < ${providerConcurrency}
        RETURNING id
      `)) as { rows: Array<{ id?: unknown }> }
      await payload.db.commitTransaction(transactionID)
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID)
      throw error
    }
    const claimedID = claim.rows[0]?.id
    if (!claimedID) continue
    dispatched += 1
    const job = await payload.findByID({
      collection: 'processing-jobs',
      depth: 0,
      id: Number(claimedID),
      overrideAccess: true,
    })

    try {
      const providerJobId = await provider.queue({
        attempt: job.attempts,
        idempotencyKey: job.processingJobId,
        mediaAssetId: (
          await payload.findByID({
            collection: 'media-assets',
            id: relationID(job.asset),
            overrideAccess: true,
          })
        ).mediaAssetId as MediaAssetId,
        objectKey: job.objectKey,
        outputPrefix: processingOutputPrefix(job.processingJobId),
        renditions: renditionsFor(job),
        source: sourceFor(job),
      })
      await payload.update({
        collection: 'processing-jobs',
        data: {
          dispatchedAt: now.toISOString(),
          leaseToken: null,
          leasedUntil: null,
          processingDeadlineAt: new Date(
            now.getTime() +
              PROCESSING_OVERHEAD_MS +
              job.sourceDurationSeconds * 2 * 1000,
          ).toISOString(),
          providerJobId,
          startedAt: now.toISOString(),
          status: 'processing',
        },
        id: job.id,
        overrideAccess: true,
      })
      await setProcessingAssetStatus(payload, job, 'processing', now)
    } catch (error) {
      const attemptedJob = { ...job, attempts: candidate.attempts + 1 }
      if (error instanceof PermanentTranscodeError) {
        logMediaDiagnostic(
          'error',
          error instanceof InvalidTranscodeMetadataError
            ? 'processing_dispatch_invalid'
            : 'processing_dispatch_rejected',
          job.id,
          error instanceof InvalidTranscodeMetadataError ? error.reason : undefined,
        )
        await failProcessingJob(payload, attemptedJob, now, 'provider_rejected')
      } else {
        logMediaDiagnostic('error', 'processing_dispatch_unavailable', job.id)
        await scheduleRetry(payload, attemptedJob, now, 'provider_unavailable')
      }
    }
  }
}

async function pollProcessingJobs(payload: Payload, now: Date, provider: TranscodeProvider) {
  const processing = await payload.find({
    collection: 'processing-jobs',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: { status: { equals: 'processing' } },
  })
  for (const job of processing.docs) {
    try {
      const status = await provider.status({
        now,
        providerJobId: job.providerJobId as ProviderJobId,
        source: sourceFor(job),
        startedAt: new Date(job.startedAt!),
      })
      if (status !== 'ready') continue
      await payload.update({
        collection: 'processing-jobs',
        data: { readyAt: now.toISOString(), status: 'ready' },
        id: job.id,
        overrideAccess: true,
      })
      await setProcessingAssetStatus(
        payload,
        job,
        'ready',
        now,
        undefined,
        provider.producesPlayReadyPackage === true,
      )
    } catch (error) {
      if (error instanceof PermanentTranscodeError) {
        await failProcessingJob(payload, job, now, 'provider_rejected')
      } else {
        await scheduleRetry(payload, job, now, 'provider_unavailable')
      }
    }
  }
}

export async function runProcessingCycle(
  payload: Payload,
  options: ProcessingOptions = {},
): Promise<void> {
  const now = options.now ?? new Date()
  const configuredProviders = options.provider && options.storage ? null : getMediaProviders()
  const provider = options.provider ?? configuredProviders!.transcode
  const storage = options.storage ?? configuredProviders!.storage
  const workerId = options.workerId ?? `worker-${process.pid}`
  const controls = await getOperationalControls(payload)
  if (controls.killSwitchEnabled) return
  await recoverExpiredJobs(payload, now, {
    and: [
      { status: { equals: 'dispatching' } },
      { leasedUntil: { less_than_equal: now.toISOString() } },
    ],
  })
  await supersedeExpiredAttempts(payload, now)
  await reconcileCancelledAttempts(payload, now, provider, storage, workerId)
  await dispatchQueuedJobs(
    payload,
    now,
    provider,
    workerId,
    controls.providerConcurrency,
  )
  await pollProcessingJobs(payload, now, provider)
}
