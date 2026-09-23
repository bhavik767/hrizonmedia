import { createHmac, randomUUID } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
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

const execFile = promisify(execFileCallback)
const PROCESSING_ID = /^processing_[0-9a-f-]{36}$/
const SOURCE_KEY = /^sources\/upload_[0-9a-f-]{36}\/source\.(?:mp4|mkv)$/
const PLAYREADY_DASH_SYSTEM_ID = '9a04f079-9840-4286-ab92-e65be0885f95'
const WIDEVINE_DASH_SYSTEM_ID = 'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed'

export function validateJob(value) {
  const job = value?.input ?? value
  if (
    !job ||
    !PROCESSING_ID.test(job.processingJobId) ||
    job.outputPrefix !== `outputs/${job.processingJobId}/` ||
    !SOURCE_KEY.test(job.objectKey) ||
    !/^drm_processing_[0-9a-f-]{36}$/.test(job.drmContentId) ||
    !Number.isInteger(job.attempt) ||
    job.attempt < 1 ||
    job.attempt > 3 ||
    !Array.isArray(job.renditions) ||
    job.renditions.length < 1 ||
    job.renditions.some(
      ({ audioCodec, height, videoCodec, width }) =>
        audioCodec !== 'aac' ||
        videoCodec !== 'h264' ||
        ![240, 270, 360, 480, 720, 1080].includes(height) ||
        !Number.isInteger(width) ||
        width < 2 ||
        height > job.source?.height ||
        width > job.source?.width,
    )
  ) {
    throw new Error('Invalid server-owned transcode job.')
  }
  return job
}

export function ffmpegArguments(job, sourcePath, clearDirectory) {
  return job.renditions.map(({ height, width }) => [
    '-y',
    '-i',
    sourcePath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    `scale=${width}:${height}`,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '22',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    path.join(clearDirectory, `${height}p.mp4`),
  ])
}

export function packagerArguments(job, clearFiles, packagedDirectory, encryptionToken) {
  return [
    '--enc_token',
    encryptionToken,
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

async function sendCallback(job, status, environment, fetcher, { playReadyPackaged = false } = {}) {
  const timestamp = String(Date.now())
  const body = JSON.stringify({
    callbackId: `worker:${job.processingJobId}:${job.attempt}:${status}`,
    outputPrefix: job.outputPrefix,
    processingJobId: job.processingJobId,
    ...(status === 'ready' ? { playReadyPackaged } : {}),
    status,
  })
  const signature = createHmac('sha256', environment.TRANSCODER_CALLBACK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('base64url')
  const response = await fetcher(
    `${environment.APPLICATION_ORIGIN}/api/internal/transcode/callback`,
    {
      body,
      headers: {
        'content-type': 'application/json',
        'x-hrizon-signature': signature,
        'x-hrizon-timestamp': timestamp,
      },
      method: 'POST',
    },
  )
  if (!response.ok) throw new Error('Application callback was rejected.')
}

export function verifyDashProtection(manifestText) {
  if (!new RegExp(WIDEVINE_DASH_SYSTEM_ID, 'i').test(manifestText)) {
    throw new Error('DoveRunner manifest is not Widevine encrypted.')
  }
  if (!new RegExp(PLAYREADY_DASH_SYSTEM_ID, 'i').test(manifestText)) {
    throw new Error('DoveRunner manifest is not PlayReady encrypted.')
  }
}

export async function processJob(value, dependencies = {}) {
  const job = validateJob(value)
  const environment = dependencies.environment ?? process.env
  const client = dependencies.client ?? new S3Client({ region: environment.VIDEO_S3_REGION })
  const run = dependencies.execFile ?? execFile
  const fetcher = dependencies.fetch ?? fetch
  const bucket = environment.VIDEO_S3_BUCKET
  if (
    !bucket ||
    !environment.APPLICATION_ORIGIN ||
    !environment.TRANSCODER_CALLBACK_SECRET ||
    !environment.DOVERUNNER_ENC_TOKEN
  ) {
    throw new Error('Worker provider configuration is incomplete.')
  }
  const controlPrefix = `transcode-control/${job.processingJobId}/attempt-${job.attempt}`
  const completionKey = `${job.outputPrefix}completion.json`
  if (await exists(client, bucket, completionKey)) return { deduplicated: true }
  if (await exists(client, bucket, `${controlPrefix}.failed`)) return { failed: true }
  if (await exists(client, bucket, `transcode-tombstones/${job.processingJobId}`))
    return { cancelled: true }
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
  try {
    const sourcePath = path.join(
      directory,
      path.extname(job.objectKey) === '.mkv' ? 'source.mkv' : 'source.mp4',
    )
    const clearDirectory = path.join(directory, 'clear')
    const packagedDirectory = path.join(directory, 'packaged')
    const thumbnailPath = path.join(directory, 'thumbnail.jpg')
    const source = await client.send(new GetObjectCommand({ Bucket: bucket, Key: job.objectKey }))
    const bytes = await source.Body?.transformToByteArray?.()
    if (!bytes) throw new Error('Private source could not be read.')
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(clearDirectory)
    await mkdir(packagedDirectory)
    await writeFile(sourcePath, bytes)
    await run(
      environment.FFMPEG_BIN ?? 'ffmpeg',
      ['-i', sourcePath, '-frames:v', '1', '-q:v', '3', '-vf', 'scale=640:-2', '-y', thumbnailPath],
      { timeout: 60 * 1000 },
    )
    for (const args of ffmpegArguments(job, sourcePath, clearDirectory)) {
      await run(environment.FFMPEG_BIN ?? 'ffmpeg', args, { timeout: 12 * 60 * 1000 })
    }
    const clearFiles = await filesUnder(clearDirectory)
    await run(
      environment.DOVERUNNER_PACKAGER_BIN ?? 'PallyConPackager',
      packagerArguments(job, clearFiles, packagedDirectory, environment.DOVERUNNER_ENC_TOKEN),
      { timeout: 3 * 60 * 1000 },
    )
    const packaged = await filesUnder(packagedDirectory)
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
    if (await exists(client, bucket, `transcode-tombstones/${job.processingJobId}`)) {
      return { cancelled: true }
    }
    const attemptPrefix = `transcode-attempts/${job.processingJobId}/${job.attempt}/`
    for (const file of deliveryFiles) {
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
    }
    for (const file of deliveryFiles) {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: encodeURIComponent(`${bucket}/${attemptPrefix}${file.relative}`),
          Key: `${job.outputPrefix}${file.relative}`,
        }),
      )
    }
    if (await exists(client, bucket, `transcode-tombstones/${job.processingJobId}`)) {
      for (const file of deliveryFiles) {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: `${job.outputPrefix}${file.relative}` }),
        )
      }
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
    await sendCallback(job, 'ready', environment, fetcher, { playReadyPackaged: true })
    for (const file of deliveryFiles) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: `${attemptPrefix}${file.relative}` }),
      )
    }
    return { ready: true }
  } catch (_error) {
    await client.send(
      new PutObjectCommand({ Body: '{}', Bucket: bucket, Key: `${controlPrefix}.failed` }),
    )
    await sendCallback(job, 'failed', environment, fetcher)
    return { failed: true }
  } finally {
    await client
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: `${controlPrefix}.lock` }))
      .catch(() => undefined)
    await rm(directory, { force: true, recursive: true })
  }
}

export function startServer(dependencies) {
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') return response.end('ok')
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
  }).listen(Number(process.env.PORT ?? 8080), '0.0.0.0')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer()
