import { createHmac, randomUUID } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { Agent } from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'

import { attemptSupersessionMarkerKey } from '../src/media/transcode-control.mjs'

const execFile = promisify(execFileCallback)
const PROCESSING_ID = /^processing_[0-9a-f-]{36}$/
const SOURCE_KEY = /^sources\/upload_[0-9a-f-]{36}\/source\.(?:mp4|mkv)$/
const PLAYREADY_DASH_SYSTEM_ID = '9a04f079-9840-4286-ab92-e65be0885f95'
const WIDEVINE_DASH_SYSTEM_ID = 'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed'
const GPU_PROBE_TIMEOUT_MS = 10_000
const ENCODING_OVERHEAD_MS = 5 * 60 * 1000
const ENCODING_MODES = new Set(['cpu', 'nvenc'])
const STORAGE_CONNECTION_TIMEOUT_MS = 10_000
const STORAGE_SOCKET_TIMEOUT_MS = 5 * 60 * 1000
export const STORAGE_PUBLICATION_CONCURRENCY = 4

export function validateJob(value) {
  const job = value?.input ?? value
  if (
    !job ||
    typeof job.callbackOrigin !== 'string' ||
    typeof job.callbackSecret !== 'string' ||
    job.callbackSecret.length < 32 ||
    !PROCESSING_ID.test(job.processingJobId) ||
    job.outputPrefix !== `outputs/${job.processingJobId}/` ||
    !SOURCE_KEY.test(job.objectKey) ||
    !/^drm_processing_[0-9a-f-]{36}$/.test(job.drmContentId) ||
    !Number.isInteger(job.attempt) ||
    job.attempt < 1 ||
    job.attempt > 3 ||
    !Number.isFinite(job.source?.durationSeconds) ||
    job.source.durationSeconds <= 0 ||
    !Number.isInteger(job.source?.height) ||
    !Number.isInteger(job.source?.width) ||
    !Array.isArray(job.renditions) ||
    job.renditions.length < 1 ||
    job.renditions.some(
      ({ audioCodec, height, videoCodec, width }) =>
        audioCodec !== 'aac' ||
        videoCodec !== 'h264' ||
        ![240, 270, 360, 480, 720, 1080].includes(height) ||
        !Number.isInteger(width) ||
        width < 2 ||
        width % 2 !== 0 ||
        height > job.source?.height ||
        width > job.source?.width,
    )
  ) {
    throw new Error('Invalid server-owned transcode job.')
  }
  return job
}

function callbackURL(job, environment) {
  const allowedOrigins = (
    environment.TRANSCODER_CALLBACK_ORIGINS ??
    environment.APPLICATION_ORIGIN ??
    ''
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin)
  if (!allowedOrigins.includes(job.callbackOrigin)) {
    throw new Error('Worker callback origin is not allowed.')
  }
  return new URL('/api/internal/transcode/callback', job.callbackOrigin).toString()
}

function requireEncodingMode(value, errorMessage) {
  if (!ENCODING_MODES.has(value)) throw new Error(errorMessage)
  return value
}

function encodingMode(environment) {
  return requireEncodingMode(
    environment.TRANSCODER_ENCODING_MODE,
    'TRANSCODER_ENCODING_MODE must be either cpu or nvenc.',
  )
}

export function encodingTimeoutMs(job) {
  return Math.ceil(ENCODING_OVERHEAD_MS + job.source.durationSeconds * 2 * 1000)
}

export function ffmpegArguments(job, sourcePath, clearDirectory, mode) {
  requireEncodingMode(mode, 'Encoding mode must be explicit.')
  const videoArguments =
    mode === 'nvenc'
      ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23']
      : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '22']
  const splitInputs = job.renditions.map((_, index) => `[v${index}]`).join('')
  const filter = [
    `[0:v:0]split=${job.renditions.length}${splitInputs}`,
    ...job.renditions.map(
      ({ height, width }, index) =>
        `[v${index}]scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2[v${index}out]`,
    ),
  ].join(';')
  return [
    '-y',
    '-i',
    sourcePath,
    '-filter_complex',
    filter,
    ...job.renditions.flatMap(({ height }, index) => [
      '-map',
      `[v${index}out]`,
      '-map',
      '0:a:0?',
      ...videoArguments,
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      path.join(clearDirectory, `${height}p.mp4`),
    ]),
  ]
}

export async function mapWithConcurrency(items, concurrency, operation) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Storage concurrency must be a positive integer.')
  }
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await operation(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

export async function supportsGpuEncoding(run, environment) {
  try {
    const gpu = await run(
      environment.NVIDIA_SMI_BIN ?? 'nvidia-smi',
      ['--query-gpu=name', '--format=csv,noheader'],
      { timeout: GPU_PROBE_TIMEOUT_MS },
    )
    if (!String(gpu?.stdout ?? '').trim()) return false
    const encoders = await run(environment.FFMPEG_BIN ?? 'ffmpeg', ['-hide_banner', '-encoders'], {
      timeout: GPU_PROBE_TIMEOUT_MS,
    })
    return /\bh264_nvenc\b/.test(String(encoders?.stdout ?? ''))
  } catch {
    return false
  }
}

export async function isWorkerReady(environment, run) {
  try {
    const mode = encodingMode(environment)
    return mode === 'cpu' || (await supportsGpuEncoding(run, environment))
  } catch {
    return false
  }
}

function logWorkerDiagnostic(level, event, job, stage) {
  console[level](
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      processingJobId: job.processingJobId,
      attempt: job.attempt,
      ...(stage ? { stage } : {}),
    }),
  )
}

function failureMarker(error, stage) {
  const stderr = String(error?.stderr ?? '')
  const providerResponseCode = stderr.match(/response error code\s*:?\s*(\d+)/i)?.[1]
  const providerOperation = stderr.match(/ERROR:\s*([A-Za-z0-9_]+\(\)) failed/i)?.[1]
  const exitCode = Number.isInteger(error?.code) ? error.code : undefined
  const classification = /check siteid or package key/i.test(stderr)
    ? 'provider_credentials_rejected'
    : /cpix|kms/i.test(stderr)
      ? 'provider_kms_request_failed'
      : undefined

  return JSON.stringify({
    version: 1,
    stage,
    ...(exitCode === undefined ? {} : { exitCode }),
    ...(providerResponseCode ? { providerResponseCode: Number(providerResponseCode) } : {}),
    ...(providerOperation ? { providerOperation } : {}),
    ...(classification ? { classification } : {}),
  })
}

async function encodeRenditions(job, sourcePath, clearDirectory, environment, run) {
  const executable = environment.FFMPEG_BIN ?? 'ffmpeg'
  const mode = encodingMode(environment)
  if (mode === 'nvenc' && !(await supportsGpuEncoding(run, environment))) {
    throw new Error('Required NVIDIA NVENC capability is unavailable.')
  }
  const stage = mode === 'nvenc' ? 'nvenc_encoding' : 'cpu_encoding'
  logWorkerDiagnostic('info', 'transcoder_stage_started', job, stage)
  await run(executable, ffmpegArguments(job, sourcePath, clearDirectory, mode), {
    timeout: encodingTimeoutMs(job),
  })
  logWorkerDiagnostic('info', 'transcoder_stage_completed', job, stage)
}

function createStorageClient(environment) {
  return new S3Client({
    region: environment.VIDEO_S3_REGION,
    maxAttempts: 3,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: STORAGE_CONNECTION_TIMEOUT_MS,
      socketTimeout: STORAGE_SOCKET_TIMEOUT_MS,
      httpsAgent: new Agent({ keepAlive: true, maxSockets: STORAGE_PUBLICATION_CONCURRENCY }),
    }),
  })
}

export function packagerArguments(job, clearFiles, packagedDirectory, encryptionToken) {
  let credentialArguments = ['--enc_token', encryptionToken]
  try {
    const credentials = JSON.parse(Buffer.from(encryptionToken, 'base64').toString('utf8'))
    if (
      credentials &&
      typeof credentials === 'object' &&
      /^[A-Za-z0-9]{4}$/.test(credentials.site_id) &&
      typeof credentials.access_key === 'string' &&
      /^[A-Za-z0-9]{32}$/.test(credentials.access_key)
    ) {
      credentialArguments = [
        '--site_id',
        credentials.site_id,
        '--access_key',
        credentials.access_key,
      ]
    }
  } catch {
    // Current CPIX encryption tokens are passed through unchanged. Older
    // deployments store a base64-encoded site/access-key credential bundle.
  }
  return [
    ...credentialArguments,
    '--content_id',
    job.drmContentId,
    '--dash',
    '--hls',
    '-i',
    ...clearFiles.map(({ absolute }) => absolute),
    '-o',
    packagedDirectory,
    '--mpd_filename',
    'manifest.mpd',
    '--m3u8_filename',
    'master.m3u8',
    '--license_url',
    'https://drm-license.doverunner.com/ri/licenseManager.do',
  ]
}

async function exists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (error) {
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) return false
    throw error
  }
}

async function filesUnder(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await filesUnder(absolute, root)))
    else files.push({ absolute, relative: path.relative(root, absolute).replaceAll('\\', '/') })
  }
  return files
}

export function normalizePackagedFiles(files) {
  const normalized = files.map((file) => ({
    ...file,
    relative: file.relative.replace(/^(?:dash|hls)\//, ''),
  }))
  const paths = new Set()
  for (const file of normalized) {
    if (paths.has(file.relative)) {
      throw new Error(`DoveRunner created conflicting delivery path: ${file.relative}`)
    }
    paths.add(file.relative)
  }
  return normalized
}

async function sendCallback(job, status, environment, fetcher) {
  const timestamp = String(Date.now())
  const body = JSON.stringify({
    attempt: job.attempt,
    callbackId: `worker:${job.processingJobId}:${job.attempt}:${status}`,
    outputPrefix: job.outputPrefix,
    processingJobId: job.processingJobId,
    ...(status === 'failed' ? { retryFailure: true } : {}),
    status,
  })
  const signature = createHmac('sha256', job.callbackSecret)
    .update(`${timestamp}.${body}`)
    .digest('base64url')
  const response = await fetcher(callbackURL(job, environment), {
    body,
    headers: {
      'content-type': 'application/json',
      'x-hrizon-signature': signature,
      'x-hrizon-timestamp': timestamp,
    },
    method: 'POST',
  })
  if (response.ok) return 'accepted'
  if (response.status === 404 || response.status === 409) return 'stale'
  throw new Error('Application callback was rejected.')
}

export function verifyDashProtection(manifestText) {
  if (!new RegExp(WIDEVINE_DASH_SYSTEM_ID, 'i').test(manifestText)) {
    throw new Error('DoveRunner manifest is not Widevine encrypted.')
  }
  if (!new RegExp(PLAYREADY_DASH_SYSTEM_ID, 'i').test(manifestText)) {
    throw new Error('DoveRunner manifest is not PlayReady encrypted.')
  }
}

async function isAttemptCancelled(client, bucket, job) {
  return (
    (await exists(client, bucket, `transcode-tombstones/${job.processingJobId}`)) ||
    (await exists(client, bucket, attemptSupersessionMarkerKey(job.processingJobId, job.attempt)))
  )
}

async function removeCanonicalPublication(client, bucket, job, deliveryFiles, completionKey) {
  const keys = deliveryFiles.map((file) => `${job.outputPrefix}${file.relative}`)
  if (completionKey) keys.push(completionKey)
  await mapWithConcurrency(keys, STORAGE_PUBLICATION_CONCURRENCY, async (key) => {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  })
}

export async function processJob(value, dependencies = {}) {
  const job = validateJob(value)
  const environment = dependencies.environment ?? process.env
  const client = dependencies.client ?? createStorageClient(environment)
  const run = dependencies.execFile ?? execFile
  const fetcher = dependencies.fetch ?? fetch
  const bucket = environment.VIDEO_S3_BUCKET
  if (
    !bucket ||
    !(environment.TRANSCODER_CALLBACK_ORIGINS ?? environment.APPLICATION_ORIGIN) ||
    !environment.DOVERUNNER_ENC_TOKEN
  ) {
    throw new Error('Worker provider configuration is incomplete.')
  }
  const controlPrefix = `transcode-control/${job.processingJobId}/attempt-${job.attempt}`
  const completionKey = `${job.outputPrefix}completion.json`
  if (await isAttemptCancelled(client, bucket, job)) return { cancelled: true }
  if (await exists(client, bucket, completionKey)) return { deduplicated: true }
  if (await exists(client, bucket, `${controlPrefix}.failed`)) return { failed: true }
  try {
    await client.send(
      new PutObjectCommand({
        Body: JSON.stringify({ acquiredAt: new Date().toISOString(), nonce: randomUUID() }),
        Bucket: bucket,
        ContentType: 'application/json',
        IfNoneMatch: '*',
        Key: `${controlPrefix}.lock`,
      }),
    )
  } catch (error) {
    if (error?.name === 'PreconditionFailed' || error?.$metadata?.httpStatusCode === 412) {
      throw new Error('This Processing Job attempt is already leased.')
    }
    throw error
  }

  const directory = await mkdtemp(path.join(tmpdir(), 'hrizon-transcode-'))
  let stage = 'source_download'
  try {
    const sourcePath = path.join(
      directory,
      path.extname(job.objectKey) === '.mkv' ? 'source.mkv' : 'source.mp4',
    )
    const clearDirectory = path.join(directory, 'clear')
    const packagedDirectory = path.join(directory, 'packaged')
    const thumbnailPath = path.join(directory, 'thumbnail.jpg')
    logWorkerDiagnostic('info', 'transcoder_stage_started', job, stage)
    const source = await client.send(new GetObjectCommand({ Bucket: bucket, Key: job.objectKey }))
    const bytes = await source.Body?.transformToByteArray?.()
    if (!bytes) throw new Error('Private source could not be read.')
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(clearDirectory)
    await mkdir(packagedDirectory)
    await writeFile(sourcePath, bytes)
    logWorkerDiagnostic('info', 'transcoder_stage_completed', job, stage)
    stage = 'thumbnail'
    logWorkerDiagnostic('info', 'transcoder_stage_started', job, stage)
    await run(
      environment.FFMPEG_BIN ?? 'ffmpeg',
      ['-i', sourcePath, '-frames:v', '1', '-q:v', '3', '-vf', 'scale=640:-2', '-y', thumbnailPath],
      { timeout: 60 * 1000 },
    )
    logWorkerDiagnostic('info', 'transcoder_stage_completed', job, stage)
    stage = 'encoding'
    await encodeRenditions(job, sourcePath, clearDirectory, environment, run)
    const clearFiles = await filesUnder(clearDirectory)
    stage = 'packaging'
    logWorkerDiagnostic('info', 'transcoder_stage_started', job, stage)
    await run(
      environment.DOVERUNNER_PACKAGER_BIN ?? 'PallyConPackager',
      packagerArguments(job, clearFiles, packagedDirectory, environment.DOVERUNNER_ENC_TOKEN),
      { timeout: 3 * 60 * 1000 },
    )
    logWorkerDiagnostic('info', 'transcoder_stage_completed', job, stage)
    stage = 'validation'
    logWorkerDiagnostic('info', 'transcoder_stage_started', job, stage)
    const packaged = normalizePackagedFiles(await filesUnder(packagedDirectory))
    const deliveryFiles = [...packaged, { absolute: thumbnailPath, relative: 'thumbnail.jpg' }]
    const manifest = packaged.find(({ relative }) => relative === 'manifest.mpd')
    if (!manifest) throw new Error('DoveRunner did not create manifest.mpd.')
    const hlsManifest = packaged.find(({ relative }) => relative === 'master.m3u8')
    if (!hlsManifest) throw new Error('DoveRunner did not create master.m3u8.')
    const manifestText = await readFile(manifest.absolute, 'utf8')
    verifyDashProtection(manifestText)
    const hlsPlaylists = packaged.filter(({ relative }) => relative.endsWith('.m3u8'))
    const hlsPlaylistTexts = await Promise.all(
      hlsPlaylists.map(async ({ absolute }) => readFile(absolute, 'utf8')),
    )
    if (
      !/^#EXTM3U/m.test(await readFile(hlsManifest.absolute, 'utf8')) ||
      !hlsPlaylistTexts.some(
        (playlist) =>
          /#EXT-X-KEY:METHOD=SAMPLE-AES,/i.test(playlist) &&
          /KEYFORMAT="com\.apple\.streamingkeydelivery"/i.test(playlist),
      )
    ) {
      throw new Error('DoveRunner HLS manifest is invalid.')
    }
    logWorkerDiagnostic('info', 'transcoder_stage_completed', job, stage)
    const attemptPrefix = `transcode-attempts/${job.processingJobId}/${job.attempt}/`
    stage = 'attempt_upload'
    logWorkerDiagnostic('info', 'transcoder_stage_started', job, stage)
    await mapWithConcurrency(deliveryFiles, STORAGE_PUBLICATION_CONCURRENCY, async (file) => {
      const contentType = file.relative.endsWith('.mpd')
        ? 'application/dash+xml'
        : file.relative.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : file.relative.endsWith('.m4s') || file.relative.endsWith('.mp4')
            ? 'video/mp4'
            : file.relative.endsWith('.jpg')
              ? 'image/jpeg'
              : 'application/octet-stream'
      await client.send(
        new PutObjectCommand({
          Body: await readFile(file.absolute),
          Bucket: bucket,
          ContentType: contentType,
          Key: `${attemptPrefix}${file.relative}`,
        }),
      )
    })
    logWorkerDiagnostic('info', 'transcoder_stage_completed', job, stage)
    if (await isAttemptCancelled(client, bucket, job)) return { cancelled: true }
    stage = 'canonical_publication'
    logWorkerDiagnostic('info', 'transcoder_stage_started', job, stage)
    await mapWithConcurrency(deliveryFiles, STORAGE_PUBLICATION_CONCURRENCY, async (file) => {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: encodeURIComponent(`${bucket}/${attemptPrefix}${file.relative}`),
          Key: `${job.outputPrefix}${file.relative}`,
        }),
      )
    })
    logWorkerDiagnostic('info', 'transcoder_stage_completed', job, stage)
    if (await isAttemptCancelled(client, bucket, job)) {
      await removeCanonicalPublication(client, bucket, job, deliveryFiles)
      return { cancelled: true }
    }
    await client.send(
      new PutObjectCommand({
        Body: JSON.stringify({
          attempt: job.attempt,
          outputPrefix: job.outputPrefix,
          renditions: job.renditions,
          version: 1,
        }),
        Bucket: bucket,
        ContentType: 'application/json',
        Key: completionKey,
      }),
    )
    if (await isAttemptCancelled(client, bucket, job)) {
      await removeCanonicalPublication(client, bucket, job, deliveryFiles, completionKey)
      return { cancelled: true }
    }
    try {
      if ((await sendCallback(job, 'ready', environment, fetcher)) === 'stale') {
        await removeCanonicalPublication(client, bucket, job, deliveryFiles, completionKey)
        return { cancelled: true }
      }
    } catch {
      // The application poller verifies completion.json and final outputs, so a
      // temporary callback outage must not discard an otherwise complete package.
      logWorkerDiagnostic('error', 'transcoder_callback_failed', job, 'ready_callback')
    }
    await mapWithConcurrency(deliveryFiles, STORAGE_PUBLICATION_CONCURRENCY, async (file) => {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: `${attemptPrefix}${file.relative}` }),
      )
    })
    return { ready: true }
  } catch (error) {
    logWorkerDiagnostic('error', 'transcoder_stage_failed', job, stage)
    await client.send(
      new PutObjectCommand({
        Body: failureMarker(error, stage),
        Bucket: bucket,
        ContentType: 'application/json',
        Key: `${controlPrefix}.failed`,
      }),
    )
    try {
      await sendCallback(job, 'failed', environment, fetcher)
    } catch {
      logWorkerDiagnostic('error', 'transcoder_callback_failed', job, 'failure_callback')
    }
    return { failed: true }
  } finally {
    await client
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: `${controlPrefix}.lock` }))
      .catch(() => undefined)
    await rm(directory, { force: true, recursive: true })
  }
}

export function startServer(dependencies = {}) {
  const environment = dependencies.environment ?? process.env
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      if (await isWorkerReady(environment, dependencies.execFile ?? execFile)) {
        return response.end('ok')
      }
      response.writeHead(503).end()
      return
    }
    if (request.method !== 'POST' || request.url !== '/jobs') {
      response.writeHead(404).end()
      return
    }
    try {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const result = await processJob(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
        dependencies,
      )
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result))
    } catch {
      response.writeHead(503).end()
    }
  }).listen(Number(environment.PORT ?? 8080), '0.0.0.0')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer()
