import 'server-only'

import { spawn } from 'node:child_process'

import { GetObjectCommand } from '@aws-sdk/client-s3'

import type { MediaProbe } from './contracts'
import { InvalidMediaError } from './errors'

const PROBE_TIMEOUT_MS = 2 * 60 * 1000
const MAX_PROBE_OUTPUT_BYTES = 64 * 1024

export interface S3ProbeClient {
  send(command: object): Promise<{
    Body?: { pipe?: (destination: NodeJS.WritableStream) => unknown }
    ContentLength?: number
  }>
}

export async function probeS3Object(
  client: S3ProbeClient,
  bucket: string,
  key: string,
): Promise<MediaProbe> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const body = response.Body
  const size = response.ContentLength
  if (!body?.pipe || typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
    throw new InvalidMediaError('The completed upload could not be read.')
  }

  const child = spawn(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name:stream=codec_type,width,height',
      '-of',
      'json',
      '-i',
      'pipe:0',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
  )
  body.pipe(child.stdin)
  const stdout: Buffer[] = []
  let outputBytes = 0
  child.stdout.on('data', (chunk: Buffer) => {
    outputBytes += chunk.byteLength
    if (outputBytes <= MAX_PROBE_OUTPUT_BYTES) stdout.push(chunk)
    else child.kill()
  })
  child.stderr.resume()

  const exitCode = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill()
      reject(new InvalidMediaError('Media inspection timed out.'))
    }, PROBE_TIMEOUT_MS)
    child.once('error', () => {
      clearTimeout(timeout)
      reject(new InvalidMediaError('Media inspection is unavailable.'))
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      resolve(code ?? 1)
    })
  })
  if (exitCode !== 0 || outputBytes > MAX_PROBE_OUTPUT_BYTES) {
    throw new InvalidMediaError('The completed upload is not valid media.')
  }

  try {
    const result = JSON.parse(Buffer.concat(stdout).toString('utf8')) as {
      format?: { duration?: string; format_name?: string }
      streams?: Array<{ codec_type?: string; height?: number; width?: number }>
    }
    const videoStreams = result.streams?.filter(({ codec_type }) => codec_type === 'video') ?? []
    const video = videoStreams[0]
    const durationSeconds = Number(result.format?.duration)
    if (
      videoStreams.length !== 1 ||
      !video ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      !Number.isSafeInteger(video.width) ||
      !Number.isSafeInteger(video.height) ||
      video.width! <= 0 ||
      video.height! <= 0
    ) {
      throw new Error('invalid probe')
    }
    const format = result.format?.format_name ?? ''
    const mimeType = format.split(',').some((name) => name === 'matroska' || name === 'webm')
      ? 'video/x-matroska'
      : format.split(',').some((name) => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(name))
        ? 'video/mp4'
        : null
    if (!mimeType) throw new Error('unsupported container')
    return {
      durationSeconds,
      height: video.height!,
      mimeType,
      size,
      width: video.width!,
    }
  } catch (error) {
    if (error instanceof InvalidMediaError) throw error
    throw new InvalidMediaError('The completed upload is not a supported MP4 or MKV video.')
  }
}
