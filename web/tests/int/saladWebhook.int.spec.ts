import { getPayload, type Payload } from 'payload'
import { Webhook } from 'svix'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POST as saladWebhook } from '@/app/(frontend)/api/internal/salad/webhook/route'
import { applyProcessingCallback } from '@/media/callbacks'
import { newMediaAssetId, newProcessingJobId, processingOutputPrefix } from '@/media/identifiers'
import config from '@/payload.config'

let payload: Payload
const now = new Date('2026-09-17T00:00:00.000Z')
const nativeJobId = '3c90c3cc-0d44-4b50-8888-8dd25736052a'
const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`

async function clean() {
  await payload.delete({ collection: 'audit-events', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'processing-jobs', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-assets', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
}

async function createProcessingJobFixture() {
  const owner = await payload.create({
    collection: 'pilot-members',
    data: {
      email: 'salad-webhook@example.test',
      invitationAcceptedAt: now.toISOString(),
      name: 'Salad webhook uploader',
      password: 'test-password',
      role: 'uploader',
      status: 'active',
    },
    overrideAccess: true,
  })
  const asset = await payload.create({
    collection: 'media-assets',
    data: {
      fileName: 'lesson.mp4',
      mediaAssetId: newMediaAssetId(),
      mimeType: 'video/mp4',
      owner: owner.id,
      size: 1024,
      status: 'processing',
      statusChangedAt: now.toISOString(),
    },
    overrideAccess: true,
  })
  const processingJobId = newProcessingJobId()
  const job = await payload.create({
    collection: 'processing-jobs',
    data: {
      asset: asset.id,
      attempts: 1,
      dispatchBy: now.toISOString(),
      dispatchedAt: now.toISOString(),
      nextAttemptAt: now.toISOString(),
      objectKey: 'sources/upload_00000000-0000-4000-8000-000000000000/source.mp4',
      owner: owner.id,
      processingDeadlineAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      processingJobId,
      providerJobId: `provider_job_${nativeJobId}`,
      queuedAt: now.toISOString(),
      renditions: [{ audioCodec: 'aac', height: 360, videoCodec: 'h264', width: 640 }],
      sourceDurationSeconds: 60,
      sourceHeight: 360,
      sourceWidth: 640,
      startedAt: now.toISOString(),
      status: 'processing',
    },
    overrideAccess: true,
  })
  return { job, processingJobId }
}

function request(body: string, webhookId = 'salad-event-1') {
  const timestamp = new Date()
  return new Request('http://localhost/api/internal/salad/webhook', {
    body,
    headers: {
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-signature': new Webhook(secret).sign(webhookId, timestamp, body),
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    },
    method: 'POST',
  })
}

describe('SaladCloud native webhook', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })
  beforeEach(async () => {
    await clean()
    vi.stubEnv('SALAD_WEBHOOK_SECRET', secret)
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await clean()
  })

  it('authenticates and deduplicates a failure while preserving the app retry budget', async () => {
    const { job, processingJobId } = await createProcessingJobFixture()
    const body = JSON.stringify({
      id: nativeJobId,
      input: { outputPrefix: processingOutputPrefix(processingJobId), processingJobId },
      metadata: { processingJobId },
      status: 'failed',
    })

    expect((await saladWebhook(request(body))).status).toBe(204)
    expect((await saladWebhook(request(body))).status).toBe(204)
    await expect(
      payload.findByID({ collection: 'processing-jobs', id: job.id, overrideAccess: true }),
    ).resolves.toMatchObject({ attempts: 1, providerJobId: null, status: 'queued' })
    const events = await payload.find({
      collection: 'audit-events',
      overrideAccess: true,
      where: { eventKey: { equals: 'processing-callback:salad:salad-event-1' } },
    })
    expect(events.docs).toHaveLength(1)
  })

  it('rejects a tampered native webhook without changing the Processing Job', async () => {
    const { job, processingJobId } = await createProcessingJobFixture()
    const signed = JSON.stringify({
      id: nativeJobId,
      input: { outputPrefix: processingOutputPrefix(processingJobId), processingJobId },
      metadata: { processingJobId },
      status: 'failed',
    })
    const tampered = signed.replace('"failed"', '"succeeded"')
    const signedRequest = request(signed, 'salad-event-tampered')
    const response = await saladWebhook(
      new Request(signedRequest.url, {
        body: tampered,
        headers: signedRequest.headers,
        method: 'POST',
      }),
    )

    expect(response.status).toBe(401)
    await expect(
      payload.findByID({ collection: 'processing-jobs', id: job.id, overrideAccess: true }),
    ).resolves.toMatchObject({ providerJobId: `provider_job_${nativeJobId}`, status: 'processing' })
  })

  it('ignores a late successful callback after deletion instead of resurrecting the asset', async () => {
    const { job, processingJobId } = await createProcessingJobFixture()
    const assetID = typeof job.asset === 'number' ? job.asset : job.asset.id
    await payload.update({
      collection: 'media-assets',
      data: { deletedAt: now.toISOString(), status: 'deleted', statusChangedAt: now.toISOString() },
      id: assetID,
      overrideAccess: true,
    })

    await expect(
      applyProcessingCallback(payload, {
        callbackId: 'late-ready-after-delete',
        outputPrefix: processingOutputPrefix(processingJobId),
        providerJobId: `provider_job_${nativeJobId}`,
        status: 'ready',
      }),
    ).resolves.toBe('ignored')
    await expect(
      payload.findByID({ collection: 'media-assets', id: assetID, overrideAccess: true }),
    ).resolves.toMatchObject({ status: 'deleted' })
  })
})
