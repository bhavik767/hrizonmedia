import { describe, expect, it } from 'vitest'

import { ffmpegArguments, packagerArguments, validateJob } from '../../transcoder/worker.mjs'

const processingJobId = 'processing_00000000-0000-4000-8000-000000000000'
const job = {
  attempt: 1,
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

describe('Salad transcoder worker contract', () => {
  it('accepts the server-owned ladder and builds H.264/AAC commands without upscaling', () => {
    expect(validateJob({ input: job })).toEqual(job)
    const commands = ffmpegArguments(job, '/work/source.mp4', '/work/clear')
    expect(commands).toHaveLength(2)
    expect(commands[0]).toEqual(expect.arrayContaining(['scale=640:360', 'libx264', 'aac']))
    expect(commands[1]).toEqual(expect.arrayContaining(['scale=1280:720', 'libx264', 'aac']))
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
})
