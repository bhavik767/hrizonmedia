import { describe, expect, it, vi } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'

import {
  ffmpegArguments,
  mapWithConcurrency,
  normalizePackagedFiles,
  packagerArguments,
  processJob,
  startServer,
  validateJob,
  verifyDashProtection,
} from '../../transcoder/worker.mjs'

const processingJobId = 'processing_00000000-0000-4000-8000-000000000000'
const job = {
  attempt: 1,
  callbackOrigin: 'https://staging.example.test',
  callbackSecret: 'callback-secret-with-at-least-thirty-two-characters',
  drmContentId: `drm_${processingJobId}`,
  objectKey: 'sources/upload_00000000-0000-4000-8000-000000000000/source.mp4',
  outputPrefix: `outputs/${processingJobId}/`,
  processingJobId,
  renditions: [
    { audioCodec: 'aac', height: 360, videoCodec: 'h264', width: 640 },
    { audioCodec: 'aac', height: 720, videoCodec: 'h264', width: 1280 },
  ],
  source: { durationSeconds: 600, height: 720, width: 1280 },
}

type WorkerCommand = { constructor: { name: string }; input?: { Key?: string } }
type WorkerDependenciesOptions = {
  callbackOK?: boolean
  callbackStatus?: number
  gpuAvailable?: boolean
  gpuEncodingFailure?: Error
  sourceFailure?: Error
  supersededAtCheck?: number
}

function workerDependencies({
  callbackOK = true,
  callbackStatus,
  gpuAvailable = true,
  gpuEncodingFailure,
  sourceFailure,
  supersededAtCheck,
}: WorkerDependenciesOptions = {}) {
  const commands: WorkerCommand[] = []
  const publication = { active: 0, peak: 0 }
  let supersessionChecks = 0
  const client = {
    send: vi.fn(async (command: WorkerCommand) => {
      commands.push(command)
      if (command.constructor.name === 'HeadObjectCommand') {
        if (
          command.input?.Key ===
          `transcode-control/${job.processingJobId}/attempt-${job.attempt}.superseded`
        ) {
          supersessionChecks += 1
          if (supersessionChecks >= (supersededAtCheck ?? Number.POSITIVE_INFINITY)) return {}
        }
        throw Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } })
      }
      if (command.constructor.name === 'GetObjectCommand') {
        if (sourceFailure) throw sourceFailure
        return { Body: { transformToByteArray: async () => Buffer.from('private source bytes') } }
      }
      if (
        command.constructor.name === 'PutObjectCommand' &&
        command.input?.Key?.startsWith(`transcode-attempts/${job.processingJobId}/`)
      ) {
        publication.active += 1
        publication.peak = Math.max(publication.peak, publication.active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        publication.active -= 1
      }
      return {}
    }),
  }
  const execFile = vi.fn(async (_executable: string, args: string[]) => {
    if (args[0] === '--query-gpu=name') return { stdout: gpuAvailable ? 'GPU 0' : '' }
    if (args.includes('-encoders'))
      return { stdout: ' V..... h264_nvenc NVIDIA NVENC H.264 encoder' }
    if (args.includes('h264_nvenc') && gpuEncodingFailure) throw gpuEncodingFailure
    if (args.includes('-frames:v')) {
      await writeFile(args.at(-1)!, 'thumbnail')
      return { stdout: '' }
    }
    if (args.includes('libx264') || args.includes('h264_nvenc')) {
      await writeFile(args.at(-1)!, 'clear video')
      return { stdout: '' }
    }
    const packagedDirectory = args[args.indexOf('-o') + 1]!
    await mkdir(`${packagedDirectory}/video`, { recursive: true })
    await Promise.all([
      writeFile(
        `${packagedDirectory}/manifest.mpd`,
        '<MPD>edef8ba9-79d6-4ace-a3c8-27dcd51d21ed 9a04f079-9840-4286-ab92-e65be0885f95</MPD>',
      ),
      writeFile(`${packagedDirectory}/master.m3u8`, '#EXTM3U'),
      writeFile(
        `${packagedDirectory}/video/stream.m3u8`,
        '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.apple.streamingkeydelivery"',
      ),
      writeFile(`${packagedDirectory}/video/segment.m4s`, 'segment'),
    ])
    return { stdout: '' }
  })
  const fetch = vi.fn(async (_url: string | URL, _init?: RequestInit) => {
    const status = callbackStatus ?? (callbackOK ? 204 : 500)
    return { ok: status >= 200 && status < 300, status }
  })
  return {
    client,
    commands,
    execFile,
    fetch,
    publication,
    environment: {
      APPLICATION_ORIGIN: job.callbackOrigin,
      DOVERUNNER_ENC_TOKEN: 'never-log-this-encryption-token',
      VIDEO_S3_BUCKET: 'private-video-bucket',
      VIDEO_S3_REGION: 'ap-south-1',
    },
  }
}

describe('Salad transcoder worker contract', () => {
  it('does no expensive work when its Processing Job attempt is already superseded', async () => {
    const dependencies = workerDependencies({ supersededAtCheck: 1 })

    await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ cancelled: true })

    expect(dependencies.execFile).not.toHaveBeenCalled()
    expect(dependencies.fetch).not.toHaveBeenCalled()
    expect(
      dependencies.commands.some(
        (command) => command.constructor.name === 'GetObjectCommand',
      ),
    ).toBe(false)
  })

  it('publishes no canonical output when superseded before publication', async () => {
    const dependencies = workerDependencies({ supersededAtCheck: 2 })

    await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ cancelled: true })

    expect(
      dependencies.commands.some(
        (command) => command.constructor.name === 'CopyObjectCommand',
      ),
    ).toBe(false)
    expect(dependencies.fetch).not.toHaveBeenCalled()
    expect(
      dependencies.commands.some(
        (command) =>
          command.constructor.name === 'PutObjectCommand' &&
          command.input?.Key === `${job.outputPrefix}completion.json`,
      ),
    ).toBe(false)
  })

  it('removes canonical files copied before supersession and sends no ready callback', async () => {
    const dependencies = workerDependencies({ supersededAtCheck: 3 })

    await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ cancelled: true })

    const copied = dependencies.commands.filter(
      (command) => command.constructor.name === 'CopyObjectCommand',
    )
    const removed = dependencies.commands.filter(
      (command) =>
        command.constructor.name === 'DeleteObjectCommand' &&
        command.input?.Key?.startsWith(job.outputPrefix),
    )
    expect(copied.length).toBeGreaterThan(0)
    expect(removed.map((command) => command.input?.Key)).toEqual(
      copied.map((command) => command.input?.Key),
    )
    expect(dependencies.fetch).not.toHaveBeenCalled()
    expect(
      dependencies.commands.some(
        (command) =>
          command.constructor.name === 'PutObjectCommand' &&
          command.input?.Key === `${job.outputPrefix}completion.json`,
      ),
    ).toBe(false)
  })

  it('removes a completion marker when superseded immediately after it is written', async () => {
    const dependencies = workerDependencies({ supersededAtCheck: 4 })

    await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ cancelled: true })

    expect(
      dependencies.commands.some(
        (command) =>
          command.constructor.name === 'PutObjectCommand' &&
          command.input?.Key === `${job.outputPrefix}completion.json`,
      ),
    ).toBe(true)
    expect(
      dependencies.commands.some(
        (command) =>
          command.constructor.name === 'DeleteObjectCommand' &&
          command.input?.Key === `${job.outputPrefix}completion.json`,
      ),
    ).toBe(true)
    expect(dependencies.fetch).not.toHaveBeenCalled()
  })

  it('removes its publication when the application rejects a stale ready callback', async () => {
    const dependencies = workerDependencies({ callbackStatus: 409 })

    await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ cancelled: true })

    expect(dependencies.fetch).toHaveBeenCalledOnce()
    expect(
      dependencies.commands.some(
        (command) =>
          command.constructor.name === 'DeleteObjectCommand' &&
          command.input?.Key === `${job.outputPrefix}completion.json`,
      ),
    ).toBe(true)
  })

  it('accepts the server-owned ladder and builds H.264/AAC commands without upscaling', () => {
    expect(validateJob({ input: job })).toEqual(job)
    const commands = ffmpegArguments(job, '/work/source.mp4', '/work/clear')
    expect(commands).toHaveLength(2)
    expect(commands[0]).toEqual(expect.arrayContaining(['scale=640:360', 'libx264', 'aac']))
    expect(commands[1]).toEqual(expect.arrayContaining(['scale=1280:720', 'libx264', 'aac']))
  })

  it('uses the approved NVENC strategy only after GPU capability selection', () => {
    expect(ffmpegArguments(job, '/work/source.mp4', '/work/clear', 'gpu')[0]).toEqual(
      expect.arrayContaining(['scale=640:360', 'h264_nvenc', 'p4', 'aac']),
    )
  })

  it('bounds concurrent publication work', async () => {
    let active = 0
    let peak = 0
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value: number) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return value * 2
    })

    expect(results).toEqual([2, 4, 6, 8, 10])
    expect(peak).toBe(2)
  })

  it('falls back from a recoverable GPU encoding failure without changing the Processing Job ladder', async () => {
    const diagnostics = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const gpuFallback = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dependencies = workerDependencies({
      gpuEncodingFailure: Object.assign(new Error('gpu busy'), { code: 1 }),
    })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ ready: true })
      const gpuCommands = dependencies.execFile.mock.calls.filter(([, args]) =>
        args.includes('h264_nvenc'),
      )
      const cpuCommands = dependencies.execFile.mock.calls.filter(([, args]) =>
        args.includes('libx264'),
      )
      expect(gpuCommands).toHaveLength(1)
      expect(cpuCommands).toHaveLength(job.renditions.length)
      expect(cpuCommands.map(([, args]) => args.at(-1))).toEqual([
        expect.stringMatching(/360p\.mp4$/),
        expect.stringMatching(/720p\.mp4$/),
      ])
      expect(
        dependencies.commands
          .map((command) => command.input?.Key)
          .filter((key) => typeof key === 'string'),
      ).toContain(`${job.outputPrefix}completion.json`)
      expect(gpuFallback).toHaveBeenCalledWith(expect.stringContaining('transcoder_gpu_fallback'))
      expect(diagnostics.mock.calls.flat().join('\n')).toContain('"stage":"source_download"')
      expect(diagnostics.mock.calls.flat().join('\n')).toContain('"stage":"packaging"')
      expect(diagnostics.mock.calls.flat().join('\n')).toContain('"stage":"validation"')
      expect(diagnostics.mock.calls.flat().join('\n')).toContain('"stage":"attempt_upload"')
      expect(diagnostics.mock.calls.flat().join('\n')).toContain('"stage":"canonical_publication"')
      expect(diagnostics.mock.calls.flat().join('\n')).not.toContain(
        dependencies.environment.DOVERUNNER_ENC_TOKEN,
      )
      expect(gpuFallback.mock.calls.flat().join('\n')).not.toContain(job.callbackSecret)
      expect(JSON.parse(String(dependencies.fetch.mock.calls.at(-1)?.[1]?.body))).toMatchObject({
        attempt: job.attempt,
        callbackId: `worker:${job.processingJobId}:${job.attempt}:ready`,
        processingJobId: job.processingJobId,
        status: 'ready',
      })
    } finally {
      diagnostics.mockRestore()
      gpuFallback.mockRestore()
    }
  })

  it('uses the CPU strategy when the Processing Job finds no compatible GPU', async () => {
    const diagnostics = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const dependencies = workerDependencies({ gpuAvailable: false })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ ready: true })
      expect(dependencies.execFile.mock.calls.some(([, args]) => args.includes('h264_nvenc'))).toBe(
        false,
      )
      expect(
        dependencies.execFile.mock.calls.filter(([, args]) => args.includes('libx264')),
      ).toHaveLength(job.renditions.length)
      expect(diagnostics).toHaveBeenCalledWith(
        expect.stringContaining('transcoder_gpu_unavailable'),
      )
    } finally {
      diagnostics.mockRestore()
    }
  })

  it('limits attempt upload concurrency during Processing Job publication', async () => {
    const diagnostics = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const dependencies = workerDependencies({ gpuAvailable: false })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ ready: true })
      expect(dependencies.publication.peak).toBe(4)
    } finally {
      diagnostics.mockRestore()
    }
  })

  it('marks a timed-out GPU attempt failed instead of risking an unbounded CPU retry', async () => {
    const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const progress = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const dependencies = workerDependencies({
      gpuEncodingFailure: Object.assign(new Error('timed out'), {
        code: 'ETIMEDOUT',
        killed: true,
        signal: 'SIGTERM',
      }),
    })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ failed: true })
      expect(dependencies.execFile.mock.calls.some(([, args]) => args.includes('libx264'))).toBe(
        false,
      )
      expect(
        dependencies.commands.some(
          (command) =>
            command.input?.Key === `transcode-control/${job.processingJobId}/attempt-1.failed`,
        ),
      ).toBe(true)
      expect(diagnostics).toHaveBeenCalledWith(expect.stringContaining('"stage":"encoding"'))
      expect(diagnostics.mock.calls.flat().join('\n')).not.toContain(job.callbackSecret)
    } finally {
      diagnostics.mockRestore()
      progress.mockRestore()
    }
  })

  it('records a source download failure safely and continues when a ready callback is unavailable', async () => {
    const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const progress = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const sourceFailure = new Error(`unavailable ${job.callbackSecret}`)
    const failedDependencies = workerDependencies({ sourceFailure })
    const callbackDependencies = workerDependencies({ callbackOK: false, gpuAvailable: false })

    try {
      await expect(processJob({ input: job }, failedDependencies)).resolves.toEqual({
        failed: true,
      })
      expect(diagnostics).toHaveBeenCalledWith(expect.stringContaining('"stage":"source_download"'))
      expect(diagnostics.mock.calls.flat().join('\n')).not.toContain(job.callbackSecret)

      await expect(processJob({ input: job }, callbackDependencies)).resolves.toEqual({
        ready: true,
      })
      expect(diagnostics).toHaveBeenCalledWith(expect.stringContaining('"stage":"ready_callback"'))
    } finally {
      diagnostics.mockRestore()
      progress.mockRestore()
    }
  })

  it('requests separately named DASH/CENC and HLS/CBCS delivery packages', () => {
    expect(
      packagerArguments(
        job,
        [{ absolute: '/work/clear/video-360.mp4' }],
        '/work/packaged',
        'enc-token',
      ),
    ).toEqual(
      expect.arrayContaining([
        '--dash',
        '--hls',
        '--mpd_filename',
        'manifest.mpd',
        '--m3u8_filename',
        'master.m3u8',
      ]),
    )
  })

  it('normalizes DoveRunner v4 combined DASH and HLS output for delivery', () => {
    expect(
      normalizePackagedFiles([
        { absolute: '/work/packaged/dash/manifest.mpd', relative: 'dash/manifest.mpd' },
        {
          absolute: '/work/packaged/dash/video/avc1/1/seg-1.m4s',
          relative: 'dash/video/avc1/1/seg-1.m4s',
        },
        { absolute: '/work/packaged/hls/master.m3u8', relative: 'hls/master.m3u8' },
        {
          absolute: '/work/packaged/hls/video/avc1/1/stream.m3u8',
          relative: 'hls/video/avc1/1/stream.m3u8',
        },
      ]),
    ).toEqual([
      { absolute: '/work/packaged/dash/manifest.mpd', relative: 'manifest.mpd' },
      {
        absolute: '/work/packaged/dash/video/avc1/1/seg-1.m4s',
        relative: 'video/avc1/1/seg-1.m4s',
      },
      { absolute: '/work/packaged/hls/master.m3u8', relative: 'master.m3u8' },
      {
        absolute: '/work/packaged/hls/video/avc1/1/stream.m3u8',
        relative: 'video/avc1/1/stream.m3u8',
      },
    ])
  })

  it('rejects a DASH package that is missing PlayReady protection', () => {
    expect(() =>
      verifyDashProtection(
        '<MPD><ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/></MPD>',
      ),
    ).toThrow('DoveRunner manifest is not PlayReady encrypted.')

    expect(() =>
      verifyDashProtection(
        '<MPD><ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/><ContentProtection schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"/></MPD>',
      ),
    ).not.toThrow()
  })

  it('rejects a worker attempt that escapes paths or upscales', () => {
    expect(() => validateJob({ ...job, objectKey: '../source.mp4' })).toThrow(
      'Invalid server-owned transcode job',
    )
    expect(() =>
      validateJob({
        ...job,
        renditions: [{ audioCodec: 'aac', height: 1080, videoCodec: 'h264', width: 1920 }],
      }),
    ).toThrow('Invalid server-owned transcode job')
  })

  it('starts a healthy queue route and rejects a credential-free sentinel before touching media', async () => {
    const client = { send: vi.fn() }
    const execFile = vi.fn()
    const server = startServer({
      client,
      environment: { PORT: '0' },
      execFile,
    })

    await new Promise((resolve) => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP worker listener.')
    expect(address.port).not.toBe(8080)
    const origin = `http://127.0.0.1:${address.port}`

    try {
      expect((await fetch(`${origin}/health`)).status).toBe(200)
      expect(
        (
          await fetch(`${origin}/jobs`, {
            body: JSON.stringify({ input: { processingJobId: 'sentinel' } }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          })
        ).status,
      ).toBe(503)
      expect(client.send).not.toHaveBeenCalled()
      expect(execFile).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})
