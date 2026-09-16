import { randomUUID } from 'node:crypto'

import { getPayload } from 'payload'
import { Webhook } from 'svix'

import { recordAuditEvent } from '@/audit/events'
import { readBoundedBody } from '@/media/body'
import { applyProcessingCallback } from '@/media/callbacks'
import type { ProviderJobId } from '@/media/identifiers'
import { getMediaProviders } from '@/media/providers'
import { PermanentTranscodeError, TransientTranscodeError } from '@/media/providers/errors'
import config from '@/payload.config'

const NATIVE_JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PROCESSING_JOB_ID = /^processing_[0-9a-f-]{36}$/

async function reject(reason: string, status: number, message: string): Promise<Response> {
  try {
    await recordAuditEvent(await getPayload({ config }), {
      action: 'processing_callback_rejected',
      details: { provider: 'salad', reason },
      eventKey: `processing-callback-rejected:${randomUUID()}`,
      occurredAt: new Date(),
    })
  } catch {
    console.error('Rejected Salad webhook audit failed.')
  }
  return Response.json({ error: message }, { status })
}

function webhookHeaders(request: Request) {
  return {
    'webhook-id': request.headers.get('webhook-id') ?? '',
    'webhook-signature': request.headers.get('webhook-signature') ?? '',
    'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
  }
}

function readEvent(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const event = value as Record<string, unknown>
  const input = event.input
  const metadata = event.metadata
  if (
    typeof event.id !== 'string' ||
    !NATIVE_JOB_ID.test(event.id) ||
    !['cancelled', 'failed', 'succeeded'].includes(String(event.status)) ||
    typeof input !== 'object' ||
    input === null ||
    typeof metadata !== 'object' ||
    metadata === null
  ) {
    return null
  }
  const jobInput = input as Record<string, unknown>
  const jobMetadata = metadata as Record<string, unknown>
  if (
    typeof jobInput.processingJobId !== 'string' ||
    !PROCESSING_JOB_ID.test(jobInput.processingJobId) ||
    jobInput.outputPrefix !== `outputs/${jobInput.processingJobId}/` ||
    jobMetadata.processingJobId !== jobInput.processingJobId
  ) {
    return null
  }
  return {
    nativeJobId: event.id,
    outputPrefix: jobInput.outputPrefix as string,
    processingJobId: jobInput.processingJobId,
    status: event.status as 'cancelled' | 'failed' | 'succeeded',
  }
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SALAD_WEBHOOK_SECRET
  if (!secret) return reject('authentication_unavailable', 503, 'Webhook authentication is unavailable.')

  let body: string
  try {
    body = Buffer.from(await readBoundedBody(request, 64 * 1024)).toString('utf8')
  } catch (error) {
    return reject(
      error instanceof Response && error.status === 413 ? 'body_too_large' : 'invalid_body',
      error instanceof Response && error.status === 413 ? 413 : 400,
      'Webhook body is invalid.',
    )
  }

  const headers = webhookHeaders(request)
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(headers['webhook-id'])) {
    return reject('authentication_failed', 401, 'Webhook authentication failed.')
  }
  let verified: unknown
  try {
    verified = new Webhook(secret).verify(body, headers)
  } catch {
    return reject('authentication_failed', 401, 'Webhook authentication failed.')
  }
  const event = readEvent(verified)
  if (!event) return reject('invalid_body', 400, 'Webhook body is invalid.')

  const payload = await getPayload({ config })
  const providerJobId = `provider_job_${event.nativeJobId}` as ProviderJobId
  try {
    if (event.status === 'succeeded') {
      const jobs = await payload.find({
        collection: 'processing-jobs',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: { providerJobId: { equals: providerJobId } },
      })
      const job = jobs.docs[0]
      if (!job) return reject('job_not_found', 404, 'Processing Job not found.')
      const status = await getMediaProviders().transcode.status({
        now: new Date(),
        providerJobId,
        source: {
          durationSeconds: job.sourceDurationSeconds,
          height: job.sourceHeight,
          width: job.sourceWidth,
        },
        startedAt: new Date(job.startedAt!),
      })
      if (status !== 'ready') return reject('outputs_not_ready', 409, 'Processing outputs are not ready.')
    }
    await applyProcessingCallback(payload, {
      callbackId: `salad:${headers['webhook-id']}`,
      outputPrefix: event.outputPrefix,
      providerJobId,
      retryFailure: event.status !== 'succeeded',
      status: event.status === 'succeeded' ? 'ready' : 'failed',
    })
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof TransientTranscodeError) {
      return reject('provider_unavailable', 503, 'Provider verification is unavailable.')
    }
    if (error instanceof PermanentTranscodeError) {
      return reject('provider_rejected', 422, 'Provider result is invalid.')
    }
    if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
      return reject('state_conflict', error.status, error.message)
    }
    console.error('Salad webhook application failed.')
    return Response.json({ error: 'Unable to apply provider webhook.' }, { status: 500 })
  }
}
