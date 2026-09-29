import 'server-only'

import type { ProviderJobId } from '../identifiers'
import type { OutputVerification, Rendition, TranscodeProvider } from './contracts'
import {
  InvalidTranscodeMetadataError,
  PermanentTranscodeError,
  TransientTranscodeError,
} from './errors'

const SALAD_API_ORIGIN = 'https://api.salad.com/api/public'
const NATIVE_JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PROCESSING_JOB_ID = /^processing_[0-9a-f-]{36}$/
const MEDIA_ASSET_ID = /^asset_[0-9a-f-]{36}$/
const SOURCE_OBJECT_KEY = /^sources\/upload_[0-9a-f-]{36}\/source\.(?:mp4|mkv)$/

export interface SaladTranscodeConfiguration {
  apiKey: string
  organizationName: string
  projectName: string
  queueName: string
  callbackOrigin: string
  callbackSecret: string
  webhookURL: string
}

export type SaladOutputVerification = OutputVerification

interface SaladJobInput extends SaladOutputVerification {
  callbackOrigin: string
  callbackSecret: string
  processingJobId: string
  source: { durationSeconds: number; height: number; width: number }
}

interface SaladJob {
  id: string
  input?: unknown
  status: 'cancelled' | 'failed' | 'pending' | 'running' | 'succeeded'
}

interface SaladDependencies {
  fetch?: typeof globalThis.fetch
  tombstone(processingJobId: string): Promise<void>
  verifyOutputs(input: OutputVerification): Promise<void>
}

function nativeJobId(providerJobId: string): string {
  const value = providerJobId.replace(/^provider_job_/, '')
  if (!NATIVE_JOB_ID.test(value)) throw new PermanentTranscodeError('Provider Job ID is invalid.')
  return value
}

function providerJobId(value: unknown): ProviderJobId {
  if (typeof value !== 'string' || !NATIVE_JOB_ID.test(value)) {
    throw new PermanentTranscodeError('SaladCloud returned an invalid Provider Job ID.')
  }
  return `provider_job_${value}` as ProviderJobId
}

function expectedRenditions(source: SaladJobInput['source']): Rendition[] {
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
    .map(([height, standardWidth]) => ({
      audioCodec: 'aac' as const,
      height: height as Rendition['height'],
      videoCodec: 'h264' as const,
      width:
        Math.round(
          (source.width * Math.min(height / source.height, standardWidth / source.width, 1)) / 2,
        ) * 2,
    }))
}

function matchesExpectedRenditions(actual: Rendition[], expected: Rendition[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((rendition, index) => {
      const expectedRendition = expected[index]
      if (!expectedRendition) return false
      const fields = Object.keys(expectedRendition) as Array<keyof Rendition>
      return (
        Object.keys(rendition).length === fields.length &&
        fields.every((field) => rendition[field] === expectedRendition[field])
      )
    })
  )
}

function validatedInput(
  input: Parameters<TranscodeProvider['queue']>[0],
  callbackOrigin: string,
  callbackSecret: string,
) {
  const validSource =
    Number.isFinite(input.source.durationSeconds) &&
    input.source.durationSeconds > 0 &&
    Number.isInteger(input.source.height) &&
    input.source.height > 0 &&
    Number.isInteger(input.source.width) &&
    input.source.width > 0
  const expected = expectedRenditions(input.source)
  let canonicalCallbackOrigin: string
  try {
    canonicalCallbackOrigin = new URL(callbackOrigin).origin
  } catch {
    throw new InvalidTranscodeMetadataError('callback_origin')
  }
  if (canonicalCallbackOrigin !== callbackOrigin) {
    throw new InvalidTranscodeMetadataError('callback_origin')
  }
  if (callbackSecret.length < 32) {
    throw new InvalidTranscodeMetadataError('callback_secret')
  }
  if (!PROCESSING_JOB_ID.test(input.idempotencyKey)) {
    throw new InvalidTranscodeMetadataError('idempotency_key')
  }
  if (!Number.isInteger(input.attempt) || input.attempt < 1 || input.attempt > 3) {
    throw new InvalidTranscodeMetadataError('attempt')
  }
  if (!MEDIA_ASSET_ID.test(input.mediaAssetId)) {
    throw new InvalidTranscodeMetadataError('media_asset_id')
  }
  if (!SOURCE_OBJECT_KEY.test(input.objectKey)) {
    throw new InvalidTranscodeMetadataError('object_key')
  }
  if (input.outputPrefix !== `outputs/${input.idempotencyKey}/`) {
    throw new InvalidTranscodeMetadataError('output_prefix')
  }
  if (!validSource) throw new InvalidTranscodeMetadataError('source')
  if (!matchesExpectedRenditions(input.renditions, expected)) {
    throw new InvalidTranscodeMetadataError('renditions')
  }
  return {
    attempt: input.attempt,
    callbackOrigin: canonicalCallbackOrigin,
    callbackSecret,
    drmContentId: `drm_${input.idempotencyKey}`,
    mediaAssetId: input.mediaAssetId,
    objectKey: input.objectKey,
    outputPrefix: input.outputPrefix,
    processingJobId: input.idempotencyKey,
    renditions: input.renditions,
    source: input.source,
  }
}

function readJob(value: unknown): SaladJob {
  if (typeof value !== 'object' || value === null) {
    throw new PermanentTranscodeError('SaladCloud returned an invalid job response.')
  }
  const job = value as Record<string, unknown>
  if (
    typeof job.id !== 'string' ||
    !NATIVE_JOB_ID.test(job.id) ||
    !['cancelled', 'failed', 'pending', 'running', 'succeeded'].includes(String(job.status))
  ) {
    throw new PermanentTranscodeError('SaladCloud returned an invalid job response.')
  }
  return job as unknown as SaladJob
}

function readCompletedInput(value: unknown): SaladJobInput {
  if (typeof value !== 'object' || value === null) {
    throw new PermanentTranscodeError('Completed SaladCloud job metadata is invalid.')
  }
  const input = value as Partial<SaladJobInput>
  if (
    typeof input.processingJobId !== 'string' ||
    !PROCESSING_JOB_ID.test(input.processingJobId) ||
    input.outputPrefix !== `outputs/${input.processingJobId}/` ||
    !Array.isArray(input.renditions) ||
    typeof input.source !== 'object' ||
    input.source === null
  ) {
    throw new PermanentTranscodeError('Completed SaladCloud job metadata is invalid.')
  }
  return input as SaladJobInput
}

async function requestJob(fetcher: typeof globalThis.fetch, url: string, init: RequestInit) {
  let response: Response
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.timeout(10_000) })
  } catch (error) {
    throw new TransientTranscodeError('SaladCloud request failed.', { cause: error })
  }
  if (response.status === 429 || response.status >= 500) {
    throw new TransientTranscodeError('SaladCloud is temporarily unavailable.')
  }
  if (!response.ok) throw new PermanentTranscodeError('SaladCloud rejected the request.')
  try {
    return readJob(await response.json())
  } catch (error) {
    if (error instanceof PermanentTranscodeError) throw error
    throw new PermanentTranscodeError('SaladCloud returned an invalid job response.', {
      cause: error,
    })
  }
}

export function createSaladTranscodeProvider(
  configuration: SaladTranscodeConfiguration,
  dependencies: SaladDependencies,
): TranscodeProvider {
  const fetcher = dependencies.fetch ?? globalThis.fetch
  const queueURL = `${SALAD_API_ORIGIN}/organizations/${encodeURIComponent(configuration.organizationName)}/projects/${encodeURIComponent(configuration.projectName)}/queues/${encodeURIComponent(configuration.queueName)}/jobs`
  const headers = {
    'Content-Type': 'application/json',
    'Salad-Api-Key': configuration.apiKey,
  }

  return {
    // The worker and S3 verifier both reject a ready result unless its DASH
    // manifest contains the PlayReady system ID.
    producesPlayReadyPackage: true,

    verifyOutputs: dependencies.verifyOutputs,

    async deleteOutputs({ processingJobId, providerJobId: id }) {
      if (processingJobId) await dependencies.tombstone(processingJobId)
      if (!id) return
      const response = await fetcher(`${queueURL}/${nativeJobId(id)}`, {
        headers,
        method: 'DELETE',
        signal: AbortSignal.timeout(10_000),
      }).catch((error) => {
        throw new TransientTranscodeError('SaladCloud cancellation failed.', { cause: error })
      })
      if (response.ok || response.status === 404) return
      if (response.status === 429 || response.status >= 500) {
        throw new TransientTranscodeError('SaladCloud cancellation is temporarily unavailable.')
      }
      throw new PermanentTranscodeError('SaladCloud rejected job cancellation.')
    },

    async queue(input) {
      const jobInput = validatedInput(
        input,
        configuration.callbackOrigin,
        configuration.callbackSecret,
      )
      const job = await requestJob(fetcher, queueURL, {
        body: JSON.stringify({
          input: jobInput,
          metadata: { processingJobId: input.idempotencyKey },
          webhook: configuration.webhookURL,
        }),
        headers,
        method: 'POST',
      })
      return providerJobId(job.id)
    },

    async status({ providerJobId: id }) {
      const job = await requestJob(fetcher, `${queueURL}/${nativeJobId(id)}`, {
        headers,
        method: 'GET',
      })
      if (job.status === 'pending' || job.status === 'running') return 'processing'
      if (job.status === 'failed') {
        throw new TransientTranscodeError('SaladCloud job failed and may be retried.')
      }
      if (job.status === 'cancelled') {
        throw new PermanentTranscodeError('SaladCloud job was cancelled.')
      }
      const input = readCompletedInput(job.input)
      try {
        await dependencies.verifyOutputs({
          attempt: input.attempt,
          outputPrefix: input.outputPrefix,
          renditions: input.renditions,
        })
      } catch (error) {
        if (error instanceof PermanentTranscodeError) throw error
        throw new TransientTranscodeError('Canonical transcoder outputs are not ready.', {
          cause: error,
        })
      }
      return 'ready'
    },
  }
}
