import { describe, expect, it, vi } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'

import {
  encodingTimeoutMs,
  ffmpegArguments,
  isWorkerReady,
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
  drmContentId: `drm${processingJobId.slice('processing_'.length).replaceAll('-', '')}`,
  objectKey: 'sources/upload_00000000-0000-4000-8000-000000000000/source.mp4',
  outputPrefix: `outputs/${processingJobId}/`,
  processingJobId,
  renditions: [
    { audioCodec: 'aac', height: 360, videoCodec: 'h264', width: 640 },
    { audioCodec: 'aac', height: 720, videoCodec: 'h264', width: 1280 },
  ],
  source: { durationSeconds: 600, height: 720, width: 1280 },
}
type TestRendition = (typeof job.renditions)[number]
const renditionLadderCases: Array<[string, TestRendition[]]> = [
  ['two', job.renditions],
  [
    'three',
    [...job.renditions, { audioCodec: 'aac', height: 480, videoCodec: 'h264', width: 854 }],
  ],
  [
    'four',
    [
      ...job.renditions,
      { audioCodec: 'aac', height: 480, videoCodec: 'h264', width: 854 },
      { audioCodec: 'aac', height: 1080, videoCodec: 'h264', width: 1920 },
    ],
  ],
]

type WorkerCommand = { constructor: { name: string }; input?: { Body?: string; Key?: string } }
type WorkerDependenciesOptions = {
  callbackOK?: boolean
  callbackStatus?: number
  encodingMode?: 'cpu' | 'nvenc'
  gpuAvailable?: boolean
  gpuEncoderAvailable?: boolean
  gpuEncodingFailure?: Error
  packagingFailure?: Error
  sourceFailure?: Error
  supersededAtCheck?: number
}

function workerDependencies({
  callbackOK = true,
  callbackStatus,
  encodingMode = 'cpu',
  gpuAvailable = true,
  gpuEncoderAvailable = true,
  gpuEncodingFailure,
  packagingFailure,
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
      return {
        stdout: gpuEncoderAvailable ? ' V..... h264_nvenc NVIDIA NVENC H.264 encoder' : '',
      }
    if (args.includes('h264_nvenc') && gpuEncodingFailure) throw gpuEncodingFailure
    if (args.includes('-frames:v')) {
      await writeFile(args.at(-1)!, 'thumbnail')
      return { stdout: '' }
    }
    if (args.includes('libx264') || args.includes('h264_nvenc')) {
      const outputs = args.filter((argument) => /[\\/]clear[\\/]\d+p\.mp4$/.test(argument))
      await Promise.all(outputs.map((output) => writeFile(output, 'clear video')))
      return { stdout: '' }
    }
    if (packagingFailure) throw packagingFailure
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
      TRANSCODER_ENCODING_MODE: encodingMode,
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
      dependencies.commands.some((command) => command.constructor.name === 'GetObjectCommand'),
    ).toBe(false)
  })

  it('publishes no canonical output when superseded before publication', async () => {
    const dependencies = workerDependencies({ supersededAtCheck: 2 })

    await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ cancelled: true })

    expect(
      dependencies.commands.some((command) => command.constructor.name === 'CopyObjectCommand'),
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

  it.each(renditionLadderCases)(
    'builds one CPU FFmpeg command for a %s-Rendition ladder',
    (_label, renditions) => {
      const ladderJob = {
        ...job,
        renditions,
        source: { ...job.source, height: 1080, width: 1920 },
      }

      expect(validateJob({ input: ladderJob })).toEqual(ladderJob)
      const command = ffmpegArguments(ladderJob, '/work/source.mp4', '/work/clear', 'cpu')

      expect(command.filter((argument) => argument === '-i')).toHaveLength(1)
      expect(command).toEqual(expect.arrayContaining(['-filter_complex', 'libx264', 'aac']))
      expect(command[command.indexOf('-filter_complex') + 1]).toContain(
        `split=${renditions.length}`,
      )
      for (const { height, width } of renditions) {
        expect(command[command.indexOf('-filter_complex') + 1]).toContain(
          `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
        )
        expect(command.map((argument) => argument.replaceAll('\\', '/'))).toContain(
          `/work/clear/${height}p.mp4`,
        )
      }
      expect(command.filter((argument) => argument === '0:a:0?')).toHaveLength(renditions.length)
    },
  )

  it.each(renditionLadderCases)(
    'executes and packages a %s-Rendition ladder as one process',
    async (_label, renditions) => {
      const dependencies = workerDependencies({ encodingMode: 'cpu' })
      const ladderJob = {
        ...job,
        renditions,
        source: { ...job.source, height: 1080, width: 1920 },
      }
      const diagnostics = vi.spyOn(console, 'info').mockImplementation(() => undefined)

      try {
        await expect(processJob({ input: ladderJob }, dependencies)).resolves.toEqual({
          ready: true,
        })
        expect(
          dependencies.execFile.mock.calls.filter(([, args]) => args.includes('libx264')),
        ).toHaveLength(1)
        const packagerCalls = dependencies.execFile.mock.calls.filter(([, args]) =>
          args.includes('--enc_token'),
        )
        expect(packagerCalls).toHaveLength(1)
        for (const { height } of renditions) {
          expect(packagerCalls[0]![1].some((argument) => argument.endsWith(`${height}p.mp4`))).toBe(
            true,
          )
        }
      } finally {
        diagnostics.mockRestore()
      }
    },
  )

  it('uses NVENC for every output only when NVENC mode is explicitly selected', () => {
    const command = ffmpegArguments(job, '/work/source.mp4', '/work/clear', 'nvenc')

    expect(command.filter((argument) => argument === 'h264_nvenc')).toHaveLength(
      job.renditions.length,
    )
    expect(command).not.toContain('libx264')
  })

  it('keeps the encoding timeout inside the attempt deadline with bounded post-encode time', () => {
    expect(encodingTimeoutMs(job)).toBe(25 * 60 * 1000)
  })

  it('returns an integer timeout for fractional source durations', () => {
    const fractionalDurationJob = {
      ...job,
      source: { ...job.source, durationSeconds: 15.582132 },
    }

    expect(encodingTimeoutMs(fractionalDurationJob)).toBe(331_165)
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

  it('fails an NVENC attempt without invoking CPU encoding', async () => {
    const diagnostics = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const failures = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dependencies = workerDependencies({
      encodingMode: 'nvenc',
      gpuEncodingFailure: Object.assign(new Error('gpu busy'), { code: 1 }),
    })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ failed: true })
      const gpuCommands = dependencies.execFile.mock.calls.filter(([, args]) =>
        args.includes('h264_nvenc'),
      )
      const cpuCommands = dependencies.execFile.mock.calls.filter(([, args]) =>
        args.includes('libx264'),
      )
      expect(gpuCommands).toHaveLength(1)
      expect(cpuCommands).toHaveLength(0)
      expect(
        dependencies.commands
          .filter((command) => command.constructor.name === 'PutObjectCommand')
          .map((command) => command.input?.Key)
          .filter((key) => typeof key === 'string'),
      ).not.toContain(`${job.outputPrefix}completion.json`)
      expect(diagnostics.mock.calls.flat().join('\n')).toContain('"stage":"source_download"')
      expect(diagnostics.mock.calls.flat().join('\n')).not.toContain(
        dependencies.environment.DOVERUNNER_ENC_TOKEN,
      )
      expect(failures.mock.calls.flat().join('\n')).not.toContain(job.callbackSecret)
      expect(JSON.parse(String(dependencies.fetch.mock.calls.at(-1)?.[1]?.body))).toMatchObject({
        attempt: job.attempt,
        callbackId: `worker:${job.processingJobId}:${job.attempt}:failed`,
        processingJobId: job.processingJobId,
        retryFailure: true,
        status: 'failed',
      })
    } finally {
      diagnostics.mockRestore()
      failures.mockRestore()
    }
  })

  it('uses one multi-output CPU process only when CPU mode is explicitly selected', async () => {
    const diagnostics = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const dependencies = workerDependencies({ encodingMode: 'cpu', gpuAvailable: false })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ ready: true })
      expect(dependencies.execFile.mock.calls.some(([, args]) => args.includes('h264_nvenc'))).toBe(
        false,
      )
      expect(
        dependencies.execFile.mock.calls.filter(([, args]) => args.includes('libx264')),
      ).toHaveLength(1)
      expect(dependencies.execFile.mock.calls.some(([, args]) => args.includes('-encoders'))).toBe(
        false,
      )
    } finally {
      diagnostics.mockRestore()
    }
  })

  it.each([
    ['NVIDIA device discovery fails', false, true],
    ['h264_nvenc is unavailable', true, false],
  ])('keeps NVENC readiness unsuccessful when %s', async (_reason, gpu, encoder) => {
    const dependencies = workerDependencies({
      encodingMode: 'nvenc',
      gpuAvailable: gpu,
      gpuEncoderAvailable: encoder,
    })

    await expect(isWorkerReady(dependencies.environment, dependencies.execFile)).resolves.toBe(
      false,
    )
  })

  it('reports NVENC readiness only after device and encoder validation pass', async () => {
    const dependencies = workerDependencies({ encodingMode: 'nvenc' })

    await expect(isWorkerReady(dependencies.environment, dependencies.execFile)).resolves.toBe(true)
  })

  it('fails an NVENC attempt safely when required GPU capability is missing', async () => {
    const failures = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const progress = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const dependencies = workerDependencies({ encodingMode: 'nvenc', gpuAvailable: false })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ failed: true })
      expect(dependencies.execFile.mock.calls.some(([, args]) => args.includes('libx264'))).toBe(
        false,
      )
      expect(
        dependencies.commands.some(
          (command) =>
            command.constructor.name === 'PutObjectCommand' &&
            command.input?.Key ===
              `transcode-control/${job.processingJobId}/attempt-${job.attempt}.failed`,
        ),
      ).toBe(true)
    } finally {
      failures.mockRestore()
      progress.mockRestore()
    }
  })

  it('limits attempt upload concurrency during Processing Job publication', async () => {
    const diagnostics = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const dependencies = workerDependencies({ encodingMode: 'cpu' })

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
      encodingMode: 'nvenc',
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
    const callbackDependencies = workerDependencies({ callbackOK: false, encodingMode: 'cpu' })

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

  it('records a non-secret provider failure classification in the attempt marker', async () => {
    const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const progress = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const packagingFailure = Object.assign(new Error('packaging failed'), {
      code: 210,
      stderr:
        'response error code: 1001\nmessage: Please check siteid or package key in console page.\nERROR: GetServerInfo() failed',
    })
    const dependencies = workerDependencies({ packagingFailure })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ failed: true })
      const marker = dependencies.commands.find(
        (command) =>
          command.constructor.name === 'PutObjectCommand' &&
          command.input?.Key === `transcode-control/${job.processingJobId}/attempt-1.failed`,
      )

      expect(JSON.parse(String(marker?.input?.Body))).toEqual({
        classification: 'provider_credentials_rejected',
        exitCode: 210,
        providerOperation: 'GetServerInfo()',
        providerResponseCode: 1001,
        stage: 'packaging',
        version: 1,
      })
      expect(String(marker?.input?.Body)).not.toContain(job.callbackSecret)
    } finally {
      diagnostics.mockRestore()
      progress.mockRestore()
    }
  })

  it('classifies the current DoveRunner CPIX communication failure without persisting stderr', async () => {
    const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const progress = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const packagingFailure = Object.assign(new Error('packaging failed'), {
      code: 1,
      stderr:
        '*** CurlHttpError Exception ***\nERROR: Unable to communicate with packageManager server via --enc_token.\nhttps://example.invalid/private-path',
    })
    const dependencies = workerDependencies({ packagingFailure })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ failed: true })
      const marker = dependencies.commands.find(
        (command) =>
          command.constructor.name === 'PutObjectCommand' &&
          command.input?.Key === `transcode-control/${job.processingJobId}/attempt-1.failed`,
      )

      expect(JSON.parse(String(marker?.input?.Body))).toEqual({
        classification: 'provider_kms_communication_failed',
        exitCode: 1,
        stage: 'packaging',
        version: 1,
      })
      expect(String(marker?.input?.Body)).not.toContain('example.invalid')
    } finally {
      diagnostics.mockRestore()
      progress.mockRestore()
    }
  })

  it('classifies DoveRunner failures emitted on stdout without persisting provider output', async () => {
    const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const progress = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const packagingFailure = Object.assign(new Error('packaging failed'), {
      code: 1,
      stdout:
        '*** CurlHttpError Exception ***\nERROR: Unable to communicate with packageManager server via --enc_token.\nhttps://example.invalid/private-path',
    })
    const dependencies = workerDependencies({ packagingFailure })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ failed: true })
      const marker = dependencies.commands.find(
        (command) =>
          command.constructor.name === 'PutObjectCommand' &&
          command.input?.Key === `transcode-control/${job.processingJobId}/attempt-1.failed`,
      )

      expect(JSON.parse(String(marker?.input?.Body))).toEqual({
        classification: 'provider_kms_communication_failed',
        exitCode: 1,
        stage: 'packaging',
        version: 1,
      })
      expect(String(marker?.input?.Body)).not.toContain('example.invalid')
    } finally {
      diagnostics.mockRestore()
      progress.mockRestore()
    }
  })

  it('persists only a redacted diagnostic for an otherwise unclassified packaging failure', async () => {
    const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const progress = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const opaqueValue = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const packagingFailure = Object.assign(new Error('packaging failed'), {
      code: 1,
      stderr: `Packaging unexpectedly aborted never-log-this-encryption-token ${opaqueValue} https://example.invalid/private`,
    })
    const dependencies = workerDependencies({ packagingFailure })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ failed: true })
      const marker = dependencies.commands.find(
        (command) =>
          command.constructor.name === 'PutObjectCommand' &&
          command.input?.Key === `transcode-control/${job.processingJobId}/attempt-1.failed`,
      )
      const body = String(marker?.input?.Body)

      expect(JSON.parse(body)).toMatchObject({
        exitCode: 1,
        providerDiagnostic: 'Packaging unexpectedly aborted <redacted> <redacted> <url>',
        stage: 'packaging',
        version: 1,
      })
      expect(body).not.toContain('never-log-this-encryption-token')
      expect(body).not.toContain(opaqueValue)
      expect(body).not.toContain('example.invalid')
    } finally {
      diagnostics.mockRestore()
      progress.mockRestore()
    }
  })

  it('retains the redacted tail of a long provider diagnostic', async () => {
    const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const progress = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const packagingFailure = Object.assign(new Error('packaging failed'), {
      code: 1,
      stderr: `${'provider progress line\n'.repeat(300)}final post-packaging failure`,
    })
    const dependencies = workerDependencies({ packagingFailure })

    try {
      await expect(processJob({ input: job }, dependencies)).resolves.toEqual({ failed: true })
      const marker = dependencies.commands.find(
        (command) =>
          command.constructor.name === 'PutObjectCommand' &&
          command.input?.Key === `transcode-control/${job.processingJobId}/attempt-1.failed`,
      )
      const body = JSON.parse(String(marker?.input?.Body))

      expect(body.providerDiagnostic).toContain('<diagnostic-truncated>')
      expect(body.providerDiagnostic).toContain('final post-packaging failure')
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
        '--enc_token',
        'enc-token',
        '--dash',
        '--hls',
        '--transport_stream_timestamp_offset_ms',
        '120000',
        '--mpd_filename',
        'manifest.mpd',
        '--m3u8_filename',
        'master.m3u8',
      ]),
    )
  })

  it('uses a configured legacy DoveRunner credential bundle without treating it as an encryption token', () => {
    const credentials = Buffer.from(
      JSON.stringify({ access_key: '0123456789abcdef0123456789ABCDEF', site_id: 'GXIW' }),
    ).toString('base64')
    const arguments_ = packagerArguments(
      job,
      [{ absolute: '/work/clear/video-360.mp4' }],
      '/work/packaged',
      credentials,
    )

    expect(arguments_).toEqual(
      expect.arrayContaining([
        '--site_id',
        'GXIW',
        '--access_key',
        '0123456789abcdef0123456789ABCDEF',
        '--dash',
        '--hls',
      ]),
    )
    expect(arguments_).not.toContain('--enc_token')
    expect(arguments_).not.toContain(credentials)
  })

  it('passes a CPIX KMS token through even when its payload contains site and access keys', () => {
    const kmsToken = Buffer.from(
      JSON.stringify({
        access_key: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
        site_id: 'GXIW',
      }),
    ).toString('base64')

    const arguments_ = packagerArguments(
      job,
      [{ absolute: '/work/clear/video-360.mp4' }],
      '/work/packaged',
      kmsToken,
    )

    expect(arguments_).toEqual(expect.arrayContaining(['--enc_token', kmsToken, '--dash', '--hls']))
    expect(arguments_).not.toContain('--site_id')
    expect(arguments_).not.toContain('--access_key')
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
      environment: { PORT: '0', TRANSCODER_ENCODING_MODE: 'cpu' },
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
