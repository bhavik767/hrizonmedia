import { describe, expect, it, vi } from 'vitest'

import {
  newMediaAssetId,
  newProcessingJobId,
  processingOutputPrefix,
} from '@/media/identifiers'
import { createSaladTranscodeProvider } from '@/media/providers/salad'
import { PermanentTranscodeError, TransientTranscodeError } from '@/media/providers/errors'

const nativeJobId = '3c90c3cc-0d44-4b50-8888-8dd25736052a'
const source = { durationSeconds: 600, height: 1080, width: 1920 }
const renditions = [
  { audioCodec: 'aac' as const, height: 360 as const, videoCodec: 'h264' as const, width: 640 },
  { audioCodec: 'aac' as const, height: 480 as const, videoCodec: 'h264' as const, width: 854 },
  { audioCodec: 'aac' as const, height: 720 as const, videoCodec: 'h264' as const, width: 1280 },
  { audioCodec: 'aac' as const, height: 1080 as const, videoCodec: 'h264' as const, width: 1920 },
]

function provider(fetch: typeof globalThis.fetch, verifyOutputs = vi.fn(async () => undefined)) {
  return {
    transcode: createSaladTranscodeProvider(
      {
        apiKey: 'salad-secret',
        organizationName: 'hrizonmedia',
        projectName: 'hrizonmedia-staging',
        queueName: 'video-transcoding',
        webhookURL: 'https://staging.example.test/api/internal/salad/webhook',
      },
      { fetch, tombstone: vi.fn(async () => undefined), verifyOutputs },
    ),
    verifyOutputs,
  }
}

describe('SaladCloud transcode provider', () => {
  it('submits only validated server-owned paths and adaptive job metadata', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ id: nativeJobId, status: 'pending' }, { status: 201 }),
    )
    const { transcode } = provider(fetch)
    const processingJobId = newProcessingJobId()
    const mediaAssetId = newMediaAssetId()

    await expect(
      transcode.queue({
        attempt: 1,
        idempotencyKey: processingJobId,
        mediaAssetId,
        objectKey: 'sources/upload_00000000-0000-4000-8000-000000000000/source.mp4',
        outputPrefix: processingOutputPrefix(processingJobId),
        renditions,
        source,
      }),
    ).resolves.toBe(`provider_job_${nativeJobId}`)

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe(
      'https://api.salad.com/api/public/organizations/hrizonmedia/projects/hrizonmedia-staging/queues/video-transcoding/jobs',
    )
    expect(init).toMatchObject({
      headers: { 'Content-Type': 'application/json', 'Salad-Api-Key': 'salad-secret' },
      method: 'POST',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      input: {
        attempt: 1,
        drmContentId: `drm_${processingJobId}`,
        mediaAssetId,
        objectKey: 'sources/upload_00000000-0000-4000-8000-000000000000/source.mp4',
        outputPrefix: processingOutputPrefix(processingJobId),
        processingJobId,
        renditions,
        source,
      },
      metadata: { processingJobId },
      webhook: 'https://staging.example.test/api/internal/salad/webhook',
    })
  })

  it('rejects noncanonical source and output paths before dispatch', async () => {
    const fetch = vi.fn()
    const { transcode } = provider(fetch as typeof globalThis.fetch)
    const processingJobId = newProcessingJobId()

    await expect(
      transcode.queue({
        attempt: 1,
        idempotencyKey: processingJobId,
        mediaAssetId: newMediaAssetId(),
        objectKey: '../private/source.mp4',
        outputPrefix: `outputs/${processingJobId}/../escape/`,
        renditions,
        source,
      }),
    ).rejects.toBeInstanceOf(PermanentTranscodeError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports success only after canonical outputs have been verified', async () => {
    const processingJobId = newProcessingJobId()
    const outputPrefix = processingOutputPrefix(processingJobId)
    const fetch = vi.fn(async () =>
      Response.json({
        id: nativeJobId,
        input: { attempt: 1, outputPrefix, processingJobId, renditions, source },
        status: 'succeeded',
      }),
    )
    const { transcode, verifyOutputs } = provider(fetch)

    await expect(
      transcode.status({
        now: new Date(),
        providerJobId: `provider_job_${nativeJobId}`,
        source,
        startedAt: new Date(),
      }),
    ).resolves.toBe('ready')
    expect(verifyOutputs).toHaveBeenCalledWith({ attempt: 1, outputPrefix, renditions })

    verifyOutputs.mockRejectedValueOnce(new Error('manifest missing'))
    await expect(
      transcode.status({
        now: new Date(),
        providerJobId: `provider_job_${nativeJobId}`,
        source,
        startedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(TransientTranscodeError)
  })

  it('classifies provider failures so the Processing Job retry budget remains authoritative', async () => {
    const transient = provider(vi.fn(async () => new Response(null, { status: 429 }))).transcode
    await expect(
      transient.status({
        now: new Date(),
        providerJobId: `provider_job_${nativeJobId}`,
        source,
        startedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(TransientTranscodeError)

    const failed = provider(
      vi.fn(async () => Response.json({ id: nativeJobId, status: 'failed' })),
    ).transcode
    await expect(
      failed.status({
        now: new Date(),
        providerJobId: `provider_job_${nativeJobId}`,
        source,
        startedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(TransientTranscodeError)

    const rejected = provider(vi.fn(async () => new Response(null, { status: 401 }))).transcode
    await expect(
      rejected.status({
        now: new Date(),
        providerJobId: `provider_job_${nativeJobId}`,
        source,
        startedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(PermanentTranscodeError)
  })

  it('cancels a known native job idempotently during output cleanup', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 202 }))
    const { transcode } = provider(fetch)

    await expect(
      transcode.deleteOutputs({
        mediaAssetId: newMediaAssetId(),
        providerJobId: `provider_job_${nativeJobId}`,
      }),
    ).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/jobs/${nativeJobId}`),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
