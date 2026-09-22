import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import { getPayload } from 'payload'

import { recordAuditEvent } from '@/audit/events'
import { applyProcessingCallback } from '@/media/callbacks'
import { getMediaProviders } from '@/media/providers'
import { readBoundedBody } from '@/media/body'
import config from '@/payload.config'

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

function validSignature(
  body: string,
  timestamp: string,
  supplied: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest()
  let received: Buffer
  try {
    received = Buffer.from(supplied, 'base64url')
  } catch {
    return false
  }
  return (
    received.toString('base64url') === supplied &&
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  )
}

async function rejectCallback(
  reason: string,
  status: number,
  message: string,
  details: Record<string, unknown> = {},
): Promise<Response> {
  try {
    await recordAuditEvent(await getPayload({ config }), {
      action: 'processing_callback_rejected',
      details: { ...details, reason },
      eventKey: `processing-callback-rejected:${randomUUID()}`,
      occurredAt: new Date(),
    })
  } catch {
    console.error('Rejected processing callback audit failed.')
  }
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.TRANSCODER_CALLBACK_SECRET
  if (!secret) {
    return rejectCallback(
      'authentication_unavailable',
      503,
      'Callback authentication is unavailable.',
    )
  }
  let body: string
  try {
    body = Buffer.from(await readBoundedBody(request, 16 * 1024)).toString('utf8')
  } catch (error) {
    if (error instanceof Response && error.status === 413) {
      return rejectCallback('body_too_large', 413, 'Callback body is too large.')
    }
    return rejectCallback('invalid_body', 400, 'Callback body is invalid.')
  }
  const timestamp = request.headers.get('x-hrizon-timestamp') ?? ''
  const signature = request.headers.get('x-hrizon-signature') ?? ''
  const timestampMs = Number(timestamp)
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS ||
    !validSignature(body, timestamp, signature, secret)
  ) {
    return rejectCallback('authentication_failed', 401, 'Callback authentication failed.')
  }

  let input: {
    callbackId?: unknown
    outputPrefix?: unknown
    playReadyPackaged?: unknown
    processingJobId?: unknown
    providerJobId?: unknown
    status?: unknown
  }
  try {
    input = JSON.parse(body)
  } catch {
    return rejectCallback('invalid_body', 400, 'Callback body is invalid.')
  }
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    typeof input.callbackId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(input.callbackId) ||
    !(
      (typeof input.providerJobId === 'string' &&
        /^provider_job_[A-Za-z0-9_-]{1,128}$/.test(input.providerJobId)) ||
      (typeof input.processingJobId === 'string' &&
        /^processing_[0-9a-f-]{36}$/.test(input.processingJobId))
    ) ||
    typeof input.outputPrefix !== 'string' ||
    input.outputPrefix.length > 200 ||
    !/^outputs\/processing_[0-9a-f-]{36}\/$/.test(input.outputPrefix) ||
    (input.status !== 'ready' && input.status !== 'failed')
    || (input.playReadyPackaged !== undefined && typeof input.playReadyPackaged !== 'boolean')
  ) {
    return rejectCallback('invalid_body', 400, 'Callback body is invalid.')
  }

  try {
    const payload = await getPayload({ config })
    let providerJobId = input.providerJobId as string | undefined
    if (!providerJobId) {
      const jobs = await payload.find({
        collection: 'processing-jobs',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: { processingJobId: { equals: input.processingJobId as string } },
      })
      providerJobId = jobs.docs[0]?.providerJobId ?? undefined
    }
    if (!providerJobId) return rejectCallback('job_not_found', 404, 'Processing Job not found.')
    const result = await applyProcessingCallback(
      payload,
      {
        callbackId: input.callbackId,
        outputPrefix: input.outputPrefix,
        playReadyPackaged: input.playReadyPackaged === true,
        providerJobId,
        status: input.status,
      },
      new Date(timestampMs),
    )
    if (result === 'ignored') await getMediaProviders().storage.deletePrefix(input.outputPrefix)
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
      return rejectCallback(
        error.status === 404 ? 'job_not_found' : 'state_conflict',
        error.status,
        error.message,
        { callbackId: input.callbackId, providerJobId: input.providerJobId },
      )
    }
    console.error('Processing callback application failed.')
    return Response.json({ error: 'Unable to apply processing callback.' }, { status: 500 })
  }
}
