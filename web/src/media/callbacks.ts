import 'server-only'

import { createLocalReq, type Payload } from 'payload'

import { recordAuditEvent } from '@/audit/events'

import { processingOutputPrefix } from './identifiers'
import {
  failProcessingJob,
  retryOrFailProcessingJob,
  setProcessingAssetStatus,
} from './processing'

function relationID(value: number | { id: number }): number {
  return typeof value === 'number' ? value : value.id
}

export async function applyProcessingCallback(
  payload: Payload,
  input: {
    callbackId: string
    outputPrefix: string
    providerJobId: string
    retryFailure?: boolean
    status: 'failed' | 'ready'
  },
  now = new Date(),
): Promise<void> {
  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null) throw new Error('Processing callbacks require transactions.')
  const req = await createLocalReq({ req: { transactionID } }, payload)

  try {
    const duplicate = await payload.find({
      collection: 'audit-events',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
      where: { eventKey: { equals: `processing-callback:${input.callbackId}` } },
    })
    if (duplicate.docs.length > 0) {
      const details = duplicate.docs[0]!.details
      const sameEvent =
        typeof details === 'object' &&
        details !== null &&
        'outputPrefix' in details &&
        details.outputPrefix === input.outputPrefix &&
        'providerJobId' in details &&
        details.providerJobId === input.providerJobId &&
        'status' in details &&
        details.status === input.status
      if (!sameEvent) {
        throw Object.assign(new Error('Callback event ID has already been used.'), { status: 409 })
      }
      await payload.db.commitTransaction(transactionID)
      return
    }
    const jobs = await payload.find({
      collection: 'processing-jobs',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
      where: { providerJobId: { equals: input.providerJobId } },
    })
    const job = jobs.docs[0]
    if (!job) throw Object.assign(new Error('Processing Job not found.'), { status: 404 })
    if (input.outputPrefix !== processingOutputPrefix(job.processingJobId)) {
      throw Object.assign(new Error('Callback output prefix is invalid.'), { status: 400 })
    }
    if (job.status !== 'processing') {
      throw Object.assign(new Error('Processing Job is not awaiting a callback.'), { status: 409 })
    }

    if (input.status === 'ready') {
      await payload.update({
        collection: 'processing-jobs',
        data: { processingDeadlineAt: null, readyAt: now.toISOString(), status: 'ready' },
        id: job.id,
        overrideAccess: true,
        req,
      })
      await setProcessingAssetStatus(payload, job, 'ready', now, req)
    } else {
      if (input.retryFailure) {
        await retryOrFailProcessingJob(payload, job, now, 'provider_callback_failed', req)
      } else {
        await failProcessingJob(payload, job, now, 'provider_callback_failed', req)
      }
    }
    await recordAuditEvent(payload, {
      action: 'processing_callback_received',
      assetID: relationID(job.asset),
      details: {
        outputPrefix: input.outputPrefix,
        providerJobId: input.providerJobId,
        status: input.status,
      },
      eventKey: `processing-callback:${input.callbackId}`,
      occurredAt: now,
      req,
    })
    await payload.db.commitTransaction(transactionID)
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}
