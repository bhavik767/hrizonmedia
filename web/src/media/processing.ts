import 'server-only'

import { randomUUID } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, Where } from 'payload'

import type { MediaAsset, ProcessingJob } from '@/payload-types'

import type { MediaAssetId, ProcessingJobId, ProviderJobId } from './identifiers'
import { PermanentTranscodeError, getFakeProviders } from './providers/fake'
import type { Rendition, SourceMedia, TranscodeProvider } from './providers/contracts'

const DISPATCH_DEADLINE_MS = 30_000
const LEASE_DURATION_MS = 30_000
const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 1_000

const FAILURE_MESSAGE =
  'Processing could not be completed. You can retry while the source is available.'

export interface ProcessingOptions {
  now?: Date
  provider?: TranscodeProvider
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
  const widths = new Map([
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

async function setAssetStatus(
  payload: Payload,
  job: ProcessingJob,
  status: 'queued' | 'processing' | 'ready' | 'failed',
  now: Date,
) {
  const playbackData =
    status === 'ready'
      ? {
          drmContentId: `drm_${job.processingJobId}`,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }
      : {}
  await payload.update({
    collection: 'media-assets',
    data: { ...playbackData, status, statusChangedAt: now.toISOString() },
    id: relationID(job.asset),
    overrideAccess: true,
  })
}

async function failJob(payload: Payload, job: ProcessingJob, now: Date, code: string) {
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
  })
  await setAssetStatus(payload, job, 'failed', now)
}

async function scheduleRetry(
  payload: Payload,
  job: ProcessingJob,
  now: Date,
  code: string,
  delay = true,
) {
  if (job.attempts >= MAX_ATTEMPTS) {
    await failJob(payload, job, now, code)
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
  })
  await setAssetStatus(payload, job, 'queued', now)
}

async function recoverExpiredJobs(payload: Payload, now: Date, where: Where) {
  const expired = await payload.find({
    collection: 'processing-jobs',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where,
  })
  for (const job of expired.docs)
    await scheduleRetry(payload, job, now, 'processing_timeout', false)
}

async function dispatchQueuedJobs(
  payload: Payload,
  now: Date,
  provider: TranscodeProvider,
  workerId: string,
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

  for (const candidate of queued.docs) {
    const leaseToken = `${workerId}:${randomUUID()}`
    const leasedUntil = new Date(now.getTime() + LEASE_DURATION_MS)
    const claim = await payload.db.drizzle.execute(sql`
      UPDATE processing_jobs
      SET status = 'dispatching',
          attempts = attempts + 1,
          lease_token = ${leaseToken},
          leased_until = ${leasedUntil},
          updated_at = ${now}
      WHERE id = ${candidate.id}
        AND status = 'queued'
        AND next_attempt_at <= ${now}
      RETURNING id
    `)
    const claimedID = claim.rows[0]?.id
    if (!claimedID) continue
    const job = await payload.findByID({
      collection: 'processing-jobs',
      depth: 0,
      id: Number(claimedID),
      overrideAccess: true,
    })

    try {
      const providerJobId = await provider.queue({
        idempotencyKey: job.processingJobId,
        mediaAssetId: (
          await payload.findByID({
            collection: 'media-assets',
            id: relationID(job.asset),
            overrideAccess: true,
          })
        ).mediaAssetId as MediaAssetId,
        objectKey: job.objectKey,
        renditions: renditionsFor(job),
        source: sourceFor(job),
      })
      await payload.update({
        collection: 'processing-jobs',
        data: {
          dispatchedAt: now.toISOString(),
          leaseToken: null,
          leasedUntil: null,
          processingDeadlineAt: new Date(now.getTime() + PROCESSING_TIMEOUT_MS).toISOString(),
          providerJobId,
          startedAt: now.toISOString(),
          status: 'processing',
        },
        id: job.id,
        overrideAccess: true,
      })
      await setAssetStatus(payload, job, 'processing', now)
    } catch (error) {
      const attemptedJob = { ...job, attempts: candidate.attempts + 1 }
      if (error instanceof PermanentTranscodeError) {
        await failJob(payload, attemptedJob, now, 'provider_rejected')
      } else {
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
      await setAssetStatus(payload, job, 'ready', now)
    } catch (error) {
      if (error instanceof PermanentTranscodeError) {
        await failJob(payload, job, now, 'provider_rejected')
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
  const provider = options.provider ?? getFakeProviders().transcode
  await recoverExpiredJobs(payload, now, {
    and: [
      { status: { equals: 'dispatching' } },
      { leasedUntil: { less_than_equal: now.toISOString() } },
    ],
  })
  await dispatchQueuedJobs(payload, now, provider, options.workerId ?? `worker-${process.pid}`)
  await pollProcessingJobs(payload, now, provider)
  await recoverExpiredJobs(payload, now, {
    and: [
      { status: { equals: 'processing' } },
      { processingDeadlineAt: { less_than_equal: now.toISOString() } },
    ],
  })
  await dispatchQueuedJobs(payload, now, provider, options.workerId ?? `worker-${process.pid}`)
}
