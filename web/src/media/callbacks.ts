import 'server-only'

import { createLocalReq, type Payload } from 'payload'

import { recordAuditEvent } from '@/audit/events'

import { failProcessingJob, setProcessingAssetStatus } from './processing'

function relationID(value: number | { id: number }): number {
  return typeof value === 'number' ? value : value.id
}

export async function applyProcessingCallback(
  payload: Payload,
  input: {
    callbackId: string
    providerJobId: string
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
      await failProcessingJob(payload, job, now, 'provider_callback_failed', req)
    }
    await recordAuditEvent(payload, {
      action: 'processing_callback_received',
      assetID: relationID(job.asset),
      details: { providerJobId: input.providerJobId, status: input.status },
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
