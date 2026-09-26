import { getPayload, type Payload } from 'payload'
import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { newProcessingJobId, processingOutputPrefix } from '@/media/identifiers'
import {
  completeUpload,
  createUploadSession,
  getVisibleAsset,
  receiveUploadPart,
  retryVisibleAssetProcessing,
} from '@/media/library'
import { fakeTranscodeProvider, getFakeProviders, resetFakeMediaStorage } from '@/media/providers/fake'
import { PermanentTranscodeError, TransientTranscodeError } from '@/media/providers/errors'
import type { TranscodeProvider } from '@/media/providers/contracts'
import { adaptiveRenditions, newProcessingJobData, runProcessingCycle } from '@/media/processing'
import config from '@/payload.config'
import { POST as processingCallback } from '@/app/(frontend)/api/internal/transcode/callback/route'
import type { Member } from '@/payload-types'
import { getOperationalOverview, updateOperationalControls } from '@/organisations/operations'
import { createTestOrganisation, createTestPlatformAdministrator } from '../helpers/organisations'
import { mp4Fixture } from '../helpers/mediaFixtures'

let payload: Payload
let organisationID: number
let uploader: Member

const at = (value: string) => new Date(value)
const start = at('2026-09-14T12:00:00.000Z')

it('creates a native rendition for sources below the 360p ladder', () => {
  expect(adaptiveRenditions({ durationSeconds: 30, height: 270, width: 480 })).toEqual([
    { audioCodec: 'aac', height: 240, videoCodec: 'h264', width: 426 },
    { audioCodec: 'aac', height: 270, videoCodec: 'h264', width: 480 },
  ])
})

function fixture(source = '1920x1080:2') {
  const [dimensions, durationText] = source.split(':')
  const bytes = Buffer.concat([
    mp4Fixture(Number(durationText)),
    Buffer.from(`HRIZON:${dimensions}`),
  ])
  return {
    bytes,
    name: 'fixture.mp4',
    size: bytes.length,
    type: 'video/mp4' as const,
  }
}

async function clean() {
  await payload.delete({ collection: 'audit-events', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-operations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'platform-administrators', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'processing-jobs', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'upload-sessions', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-assets', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-settings', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisation-memberships', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'organisations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'members', overrideAccess: true, where: {} })
}

async function upload(file = fixture(), provider: TranscodeProvider = fakeTranscodeProvider) {
  const providers = { ...getFakeProviders(), transcode: provider }
  const session = await createUploadSession(
    payload,
    uploader,
    {
      fileFingerprint: `${file.name}:${file.size}:test`,
      fileName: file.name,
      mimeType: file.type,
      organisationID,
      size: file.size,
    },
    providers,
  )
  const part = await receiveUploadPart(
    payload,
    uploader,
    session.uploadSessionId,
    1,
    file.bytes,
    providers,
  )
  await completeUpload(payload, uploader, session.uploadSessionId, [part], providers, {
    now: start,
    provider,
  })
  return session
}

describe('reliable Processing Jobs', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    await clean()
    resetFakeMediaStorage()
    uploader = await payload.create({
      collection: 'members',
      data: {
        email: 'processing-uploader@example.test',
        name: 'Processing uploader',
        password: 'uploader-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    organisationID = await createTestOrganisation(payload, uploader)
  })

  afterAll(clean)

  it('dispatches a completed upload immediately with idempotency and adaptive outputs', async () => {
    const provider = { ...fakeTranscodeProvider, queue: vi.fn(fakeTranscodeProvider.queue) }
    const session = await upload(fixture('1280x720:2'), provider)
    const detail = await getVisibleAsset(payload, uploader, session.asset.mediaAssetId)

    expect(provider.queue).toHaveBeenCalledOnce()
    expect(provider.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^processing_/),
        outputPrefix: expect.stringMatching(/^outputs\/processing_[a-f0-9-]+\/$/),
        renditions: [
          { audioCodec: 'aac', height: 360, videoCodec: 'h264', width: 640 },
          { audioCodec: 'aac', height: 480, videoCodec: 'h264', width: 854 },
          { audioCodec: 'aac', height: 720, videoCodec: 'h264', width: 1280 },
        ],
      }),
    )
    expect(detail.status).toBe('processing')
    expect(detail.renditions?.map(({ height }) => height)).toEqual([360, 480, 720])
    expect(at(detail.dispatchedAt!).getTime() - start.getTime()).toBeLessThanOrEqual(30_000)
  })

  it('preserves aspect ratio for narrow sources without upscaling', async () => {
    const provider = { ...fakeTranscodeProvider, queue: vi.fn(fakeTranscodeProvider.queue) }
    await upload(fixture('640x1080:2'), provider)

    expect(provider.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        renditions: [
          expect.objectContaining({ height: 360, width: 214 }),
          expect.objectContaining({ height: 480, width: 284 }),
          expect.objectContaining({ height: 720, width: 426 }),
          expect.objectContaining({ height: 1080, width: 640 }),
        ],
      }),
    )
  })

  it('runs recovery autonomously through the scheduled Payload worker', async () => {
    await upload()
    const jobs = await payload.find({
      collection: 'processing-jobs',
      overrideAccess: true,
      where: {},
    })
    await payload.update({
      collection: 'processing-jobs',
      data: {
        attempts: 0,
        nextAttemptAt: new Date(Date.now() - 1_000).toISOString(),
        providerJobId: null,
        status: 'queued',
      },
      id: jobs.docs[0]!.id,
      overrideAccess: true,
    })
    await payload.jobs.queue({ input: {}, queue: 'media-processing', task: 'process-media-jobs' })

    await payload.jobs.run({ limit: 1, queue: 'media-processing' })

    await expect(
      payload.findByID({
        collection: 'processing-jobs',
        id: jobs.docs[0]!.id,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ attempts: 1, status: 'processing' })
    expect(payload.config.jobs.autoRun).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '*/10 * * * * *' })]),
    )
  })

  it('refuses the default fake processing provider in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'production')
    try {
      await expect(runProcessingCycle(payload)).rejects.toThrow('prohibited in production')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('rolls back upload completion when its Processing Job cannot be created', async () => {
    const file = fixture()
    const providers = getFakeProviders()
    const session = await createUploadSession(
      payload,
      uploader,
      {
        fileFingerprint: `${file.name}:${file.size}:test`,
        fileName: file.name,
        mimeType: file.type,
        organisationID,
        size: file.size,
      },
      providers,
    )
    const part = await receiveUploadPart(
      payload,
      uploader,
      session.uploadSessionId,
      1,
      file.bytes,
      providers,
    )
    const assets = await payload.find({
      collection: 'media-assets',
      overrideAccess: true,
      where: {},
    })
    await payload.create({
      collection: 'processing-jobs',
      data: newProcessingJobData({
        asset: assets.docs[0]!,
        objectKey: 'existing/source.mp4',
        ownerID: uploader.id,
        processingJobId: newProcessingJobId(),
        queuedAt: start,
        source: { durationSeconds: 2, height: 1080, width: 1920 },
      }),
      overrideAccess: true,
    })

    await expect(
      completeUpload(payload, uploader, session.uploadSessionId, [part], providers, { now: start }),
    ).rejects.toBeTruthy()

    const sessions = await payload.find({
      collection: 'upload-sessions',
      overrideAccess: true,
      where: {},
    })
    expect(sessions.docs[0]).toMatchObject({ objectKey: null, status: 'pending' })
  })

  it('leases a queued job to only one concurrent worker', async () => {
    const session = await upload()
    const jobs = await payload.find({
      collection: 'processing-jobs',
      overrideAccess: true,
      where: {},
    })
    await payload.update({
      collection: 'processing-jobs',
      data: {
        attempts: 0,
        leaseToken: null,
        leasedUntil: null,
        providerJobId: null,
        status: 'queued',
      },
      id: jobs.docs[0]!.id,
      overrideAccess: true,
    })
    const queue = vi.fn()
    const provider: TranscodeProvider = {
      ...fakeTranscodeProvider,
      queue: async (input) => {
        queue()
        await Promise.resolve()
        return fakeTranscodeProvider.queue(input)
      },
    }

    await Promise.all([
      runProcessingCycle(payload, { now: start, provider, workerId: 'worker-a' }),
      runProcessingCycle(payload, { now: start, provider, workerId: 'worker-b' }),
    ])

    expect(queue).toHaveBeenCalledOnce()
    await expect(
      getVisibleAsset(payload, uploader, session.asset.mediaAssetId),
    ).resolves.toMatchObject({
      status: 'processing',
    })
  })

  it('dispatches no more jobs than the configured provider concurrency', async () => {
    await upload()
    await upload()
    await upload()
    const jobs = await payload.find({
      collection: 'processing-jobs',
      overrideAccess: true,
      pagination: false,
      where: {},
    })
    for (const job of jobs.docs) {
      await payload.update({
        collection: 'processing-jobs',
        data: {
          attempts: 0,
          leaseToken: null,
          leasedUntil: null,
          nextAttemptAt: start.toISOString(),
          providerJobId: null,
          status: 'queued',
        },
        id: job.id,
        overrideAccess: true,
      })
    }
    const operator = await payload.create({
      collection: 'members',
      data: {
        email: 'concurrency-operator@example.test',
        name: 'Concurrency operator',
        password: 'operator-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    await createTestPlatformAdministrator(payload, operator)
    await updateOperationalControls(payload, operator, {
      killSwitchEnabled: false,
      providerConcurrency: 2,
    })
    const queue = vi.fn(fakeTranscodeProvider.queue)

    const provider = { ...fakeTranscodeProvider, queue }
    await Promise.all([
      runProcessingCycle(payload, { now: start, provider, workerId: 'limited-worker-a' }),
      runProcessingCycle(payload, { now: start, provider, workerId: 'limited-worker-b' }),
    ])

    expect(queue).toHaveBeenCalledTimes(2)
    const after = await payload.find({
      collection: 'processing-jobs',
      overrideAccess: true,
      pagination: false,
      where: {},
    })
    expect(after.docs.filter(({ status }) => status === 'processing')).toHaveLength(2)
    expect(after.docs.filter(({ status }) => status === 'queued')).toHaveLength(1)
  })

  it('makes no provider calls while the operator kill switch is enabled', async () => {
    await upload()
    const jobs = await payload.find({
      collection: 'processing-jobs',
      limit: 1,
      overrideAccess: true,
      where: {},
    })
    await payload.update({
      collection: 'processing-jobs',
      data: { nextAttemptAt: start.toISOString(), providerJobId: null, status: 'queued' },
      id: jobs.docs[0]!.id,
      overrideAccess: true,
    })
    const operator = await payload.create({
      collection: 'members',
      data: {
        email: 'processing-kill-switch-operator@example.test',
        name: 'Processing kill switch operator',
        password: 'operator-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    await createTestPlatformAdministrator(payload, operator)
    await updateOperationalControls(payload, operator, {
      killSwitchEnabled: true,
      providerConcurrency: 2,
    })
    const queue = vi.fn(fakeTranscodeProvider.queue)
    const status = vi.fn(fakeTranscodeProvider.status)

    await runProcessingCycle(payload, {
      now: start,
      provider: { ...fakeTranscodeProvider, queue, status },
    })

    expect(queue).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
    await expect(
      payload.findByID({
        collection: 'processing-jobs',
        id: jobs.docs[0]!.id,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ status: 'queued' })
  })

  it('reclaims an abandoned dispatch lease', async () => {
    await upload()
    const jobs = await payload.find({
      collection: 'processing-jobs',
      overrideAccess: true,
      where: {},
    })
    await payload.update({
      collection: 'processing-jobs',
      data: {
        leasedUntil: at('2026-09-14T12:00:01.000Z').toISOString(),
        leaseToken: 'stopped-worker:lease',
        providerJobId: null,
        status: 'dispatching',
      },
      id: jobs.docs[0]!.id,
      overrideAccess: true,
    })

    await runProcessingCycle(payload, { now: at('2026-09-14T12:00:02.000Z') })

    await expect(
      payload.findByID({
        collection: 'processing-jobs',
        id: jobs.docs[0]!.id,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ attempts: 2, leaseToken: null, status: 'processing' })
  })

  it('retries transient failures twice, sanitizes exhaustion, and lets an operator retry', async () => {
    const transientProvider: TranscodeProvider = {
      ...fakeTranscodeProvider,
      queue: async () => {
        throw new TransientTranscodeError('secret provider outage: credential=abc')
      },
    }
    const session = await upload(fixture(), transientProvider)

    await runProcessingCycle(payload, {
      now: at('2026-09-14T12:00:02.000Z'),
      provider: transientProvider,
    })
    await runProcessingCycle(payload, {
      now: at('2026-09-14T12:00:06.000Z'),
      provider: transientProvider,
    })

    const failed = await getVisibleAsset(payload, uploader, session.asset.mediaAssetId)
    expect(failed).toMatchObject({
      canRetry: true,
      failureMessage:
        'Processing could not be completed. You can retry while the source is available.',
      status: 'failed',
    })
    expect(JSON.stringify(failed)).not.toContain('credential=abc')
    const originalJob = await payload.find({
      collection: 'processing-jobs',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { asset: { equals: session.asset.id } },
    })

    const operator = await payload.create({
      collection: 'members',
      data: {
        email: 'processing-operator@example.test',
        name: 'Processing operator',
        password: 'operator-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    await createTestPlatformAdministrator(payload, operator)
    const retried = await retryVisibleAssetProcessing(
      payload,
      operator,
      session.asset.mediaAssetId,
      {
        now: at('2026-09-14T12:00:07.000Z'),
        provider: fakeTranscodeProvider,
      },
    )
    expect(retried.status).toBe('processing')
    const retriedJob = await payload.find({
      collection: 'processing-jobs',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { asset: { equals: session.asset.id } },
    })
    expect(retriedJob.docs[0]!.processingJobId).not.toBe(originalJob.docs[0]!.processingJobId)
  })

  it('recovers an expired processing timeout without stranding or duplicating the job', async () => {
    const session = await upload()
    const jobs = await payload.find({
      collection: 'processing-jobs',
      overrideAccess: true,
      where: {},
    })
    await payload.update({
      collection: 'processing-jobs',
      data: { processingDeadlineAt: at('2026-09-14T12:00:01.000Z').toISOString() },
      id: jobs.docs[0]!.id,
      overrideAccess: true,
    })

    await runProcessingCycle(payload, { now: at('2026-09-14T12:00:02.000Z') })

    const after = await payload.findByID({
      collection: 'processing-jobs',
      id: jobs.docs[0]!.id,
      overrideAccess: true,
    })
    expect(after.attempts).toBe(2)
    expect(after.processingJobId).toBe(jobs.docs[0]!.processingJobId)
    expect(after.status).toBe('processing')
    await expect(
      getVisibleAsset(payload, uploader, session.asset.mediaAssetId),
    ).resolves.toBeTruthy()
  })

  it('measures a ten-minute 1080p asset becoming ready within fifteen minutes', async () => {
    const session = await upload(fixture('1920x1080:600'))

    await runProcessingCycle(payload, { now: at('2026-09-14T12:14:00.000Z') })
    const ready = await getVisibleAsset(payload, uploader, session.asset.mediaAssetId)

    expect(ready.status).toBe('ready')
    expect(at(ready.readyAt!).getTime() - start.getTime()).toBeLessThanOrEqual(15 * 60 * 1000)
  })

  it('does not offer manual retry after a permanent failure without its source', async () => {
    const provider: TranscodeProvider = {
      ...fakeTranscodeProvider,
      queue: async () => {
        throw new PermanentTranscodeError('unsafe provider detail')
      },
    }
    const session = await upload(fixture(), provider)
    const uploads = await payload.find({
      collection: 'upload-sessions',
      overrideAccess: true,
      where: {},
    })
    await payload.update({
      collection: 'upload-sessions',
      data: { objectKey: null },
      id: uploads.docs[0]!.id,
      overrideAccess: true,
    })

    const detail = await getVisibleAsset(payload, uploader, session.asset.mediaAssetId)
    expect(detail.canRetry).toBe(false)
    await expect(
      retryVisibleAssetProcessing(payload, uploader, session.asset.mediaAssetId, { now: start }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('accepts a signed idempotent processing callback and records it', async () => {
    const session = await upload()
    const jobs = await payload.find({
      collection: 'processing-jobs',
      limit: 1,
      overrideAccess: true,
      where: {},
    })
    const job = jobs.docs[0]!
    const callbackBody = JSON.stringify({
      callbackId: 'callback-issue-39',
      outputPrefix: processingOutputPrefix(job.processingJobId),
      playReadyPackaged: true,
      providerJobId: job.providerJobId,
      status: 'ready',
    })
    const timestamp = String(Date.now())
    const secret = 'callback-test-secret'
    vi.stubEnv('TRANSCODER_CALLBACK_SECRET', secret)
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${callbackBody}`)
      .digest('base64url')
    const request = () =>
      new Request('http://localhost/api/internal/transcode/callback', {
        body: callbackBody,
        headers: {
          'content-type': 'application/json',
          'x-hrizon-signature': signature,
          'x-hrizon-timestamp': timestamp,
        },
        method: 'POST',
      })

    expect((await processingCallback(request())).status).toBe(204)
    expect((await processingCallback(request())).status).toBe(204)
    const operator = await payload.create({
      collection: 'members',
      data: {
        email: 'callback-audit-operator@example.test',
        name: 'Callback audit operator',
        password: 'operator-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    await createTestPlatformAdministrator(payload, operator)
    const callbackEvents = (await getOperationalOverview(payload, operator)).auditEvents.filter(
      ({ action }) => action === 'processing_callback_received',
    )
    expect(callbackEvents).toHaveLength(1)
    expect(callbackEvents[0]).toMatchObject({
      assetId: session.asset.mediaAssetId,
      details: { providerJobId: job.providerJobId, status: 'ready' },
    })
    await expect(
      payload.find({
        collection: 'media-assets',
        limit: 1,
        overrideAccess: true,
        where: { mediaAssetId: { equals: session.asset.mediaAssetId } },
      }),
    ).resolves.toMatchObject({ docs: [{ playReadyPackaged: true }] })
    vi.unstubAllEnvs()
  })

  it('rejects a signed callback whose output prefix escapes its Processing Job', async () => {
    await upload()
    const job = (
      await payload.find({
        collection: 'processing-jobs',
        limit: 1,
        overrideAccess: true,
        where: {},
      })
    ).docs[0]!
    const callbackBody = JSON.stringify({
      callbackId: 'callback-escaping-output',
      outputPrefix: `outputs/${job.processingJobId}/../private/`,
      providerJobId: job.providerJobId,
      status: 'ready',
    })
    const timestamp = String(Date.now())
    const secret = 'callback-test-secret'
    vi.stubEnv('TRANSCODER_CALLBACK_SECRET', secret)
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${callbackBody}`)
      .digest('base64url')

    const response = await processingCallback(
      new Request('http://localhost/api/internal/transcode/callback', {
        body: callbackBody,
        headers: {
          'content-type': 'application/json',
          'x-hrizon-signature': signature,
          'x-hrizon-timestamp': timestamp,
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    await expect(
      payload.findByID({
        collection: 'processing-jobs',
        id: job.id,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ status: 'processing' })
    vi.unstubAllEnvs()
  })

  it('rejects reuse of a callback event ID for different signed content', async () => {
    await upload()
    const job = (
      await payload.find({
        collection: 'processing-jobs',
        limit: 1,
        overrideAccess: true,
        where: {},
      })
    ).docs[0]!
    const timestamp = String(Date.now())
    const secret = 'callback-test-secret'
    vi.stubEnv('TRANSCODER_CALLBACK_SECRET', secret)
    const request = (status: 'failed' | 'ready') => {
      const body = JSON.stringify({
        callbackId: 'callback-content-binding',
        outputPrefix: processingOutputPrefix(job.processingJobId),
        providerJobId: job.providerJobId,
        status,
      })
      return new Request('http://localhost/api/internal/transcode/callback', {
        body,
        headers: {
          'content-type': 'application/json',
          'x-hrizon-signature': createHmac('sha256', secret)
            .update(`${timestamp}.${body}`)
            .digest('base64url'),
          'x-hrizon-timestamp': timestamp,
        },
        method: 'POST',
      })
    }

    expect((await processingCallback(request('ready'))).status).toBe(204)
    expect((await processingCallback(request('failed'))).status).toBe(409)
    await expect(
      payload.findByID({
        collection: 'processing-jobs',
        id: job.id,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ status: 'ready' })
    vi.unstubAllEnvs()
  })

  it('rolls back callback state so a retry can restore missing audit evidence', async () => {
    await upload()
    const job = (
      await payload.find({
        collection: 'processing-jobs',
        limit: 1,
        overrideAccess: true,
        where: {},
      })
    ).docs[0]!
    const callbackBody = JSON.stringify({
      callbackId: 'callback-audit-retry',
      outputPrefix: processingOutputPrefix(job.processingJobId),
      providerJobId: job.providerJobId,
      status: 'ready',
    })
    const timestamp = String(Date.now())
    const secret = 'callback-test-secret'
    vi.stubEnv('TRANSCODER_CALLBACK_SECRET', secret)
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${callbackBody}`)
      .digest('base64url')
    const request = () =>
      new Request('http://localhost/api/internal/transcode/callback', {
        body: callbackBody,
        headers: {
          'content-type': 'application/json',
          'x-hrizon-signature': signature,
          'x-hrizon-timestamp': timestamp,
        },
        method: 'POST',
      })
    const create = payload.create.bind(payload)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const createSpy = vi.spyOn(payload, 'create').mockImplementation(async (args) => {
      if (
        args.collection === 'audit-events' &&
        'action' in args.data &&
        args.data.action === 'processing_callback_received'
      ) {
        createSpy.mockImplementation(create)
        throw new Error('audit database unavailable callback-secret=must-not-leak')
      }
      return create(args as never)
    })

    expect((await processingCallback(request())).status).toBe(500)
    expect(consoleError.mock.calls.flat().map(String).join(' ')).not.toContain('must-not-leak')
    expect((await processingCallback(request())).status).toBe(204)
    const events = await payload.find({
      collection: 'audit-events',
      overrideAccess: true,
      where: { action: { equals: 'processing_callback_received' } },
    })
    expect(events.docs).toHaveLength(1)
    consoleError.mockRestore()
    vi.unstubAllEnvs()
  })

  it('rejects an unsigned processing callback without changing state', async () => {
    await upload()
    vi.stubEnv('TRANSCODER_CALLBACK_SECRET', 'callback-test-secret')
    const response = await processingCallback(
      new Request('http://localhost/api/internal/transcode/callback', {
        body: JSON.stringify({
          callbackId: 'unsigned-callback',
          providerJobId: 'provider_job_unknown',
          status: 'ready',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(401)
    const operator = await payload.create({
      collection: 'members',
      data: {
        email: 'rejected-callback-operator@example.test',
        name: 'Rejected callback operator',
        password: 'operator-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    await createTestPlatformAdministrator(payload, operator)
    const events = (await getOperationalOverview(payload, operator)).auditEvents.filter(
      ({ action }) => action === 'processing_callback_rejected',
    )
    expect(events).toEqual([
      expect.objectContaining({ details: { reason: 'authentication_failed' } }),
    ])
    vi.unstubAllEnvs()
  })

  it('rejects expired and tampered signed callbacks without changing state', async () => {
    await upload()
    const job = (
      await payload.find({
        collection: 'processing-jobs',
        limit: 1,
        overrideAccess: true,
        where: {},
      })
    ).docs[0]!
    const secret = 'callback-test-secret'
    vi.stubEnv('TRANSCODER_CALLBACK_SECRET', secret)
    const body = JSON.stringify({
      callbackId: 'callback-authentication-check',
      outputPrefix: processingOutputPrefix(job.processingJobId),
      providerJobId: job.providerJobId,
      status: 'ready',
    })
    const expiredTimestamp = String(Date.now() - 10 * 60 * 1000)
    const currentTimestamp = String(Date.now())
    const request = (requestBody: string, timestamp: string, signedBody = requestBody) =>
      new Request('http://localhost/api/internal/transcode/callback', {
        body: requestBody,
        headers: {
          'content-type': 'application/json',
          'x-hrizon-signature': createHmac('sha256', secret)
            .update(`${timestamp}.${signedBody}`)
            .digest('base64url'),
          'x-hrizon-timestamp': timestamp,
        },
        method: 'POST',
      })

    expect((await processingCallback(request(body, expiredTimestamp))).status).toBe(401)
    expect(
      (
        await processingCallback(
          request(body.replace('"ready"', '"failed"'), currentTimestamp, body),
        )
      ).status,
    ).toBe(401)
    await expect(
      payload.findByID({
        collection: 'processing-jobs',
        id: job.id,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ status: 'processing' })
    vi.unstubAllEnvs()
  })

  it('rejects a correctly signed JSON null callback with a sanitized validation response', async () => {
    const body = 'null'
    const timestamp = String(Date.now())
    const secret = 'callback-test-secret'
    vi.stubEnv('TRANSCODER_CALLBACK_SECRET', secret)
    const response = await processingCallback(
      new Request('http://localhost/api/internal/transcode/callback', {
        body,
        headers: {
          'content-type': 'application/json',
          'x-hrizon-timestamp': timestamp,
          'x-hrizon-signature': createHmac('sha256', secret)
            .update(`${timestamp}.${body}`)
            .digest('base64url'),
        },
        method: 'POST',
      }),
    )
    expect(response.status).toBe(400)
    vi.unstubAllEnvs()
  })
})
