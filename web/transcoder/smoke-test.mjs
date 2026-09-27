import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const image = process.argv[2] ?? 'hrizonmedia-transcoder:smoke'
let containerId

async function docker(args, options = {}) {
  return execFile('docker', args, { maxBuffer: 1024 * 1024, ...options })
}

async function waitForHealth(origin) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if ((await fetch(`${origin}/health`)).ok) return
    } catch {
      // The entrypoint is still starting the HTTP worker.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('Transcoder image did not become healthy within 30 seconds.')
}

try {
  await docker(['build', '--platform', 'linux/amd64', '--pull=false', '-f', 'transcoder/Dockerfile', '-t', image, '.'], {
    stdio: 'inherit',
  })
  await docker([
    'run', '--rm', '--entrypoint', '/bin/sh', image, '-ec',
    'test -x "$FFMPEG_BIN" && "$FFMPEG_BIN" -version >/dev/null && test -x "$DOVERUNNER_PACKAGER_BIN" && "$DOVERUNNER_PACKAGER_BIN" --help >/dev/null',
  ])
  const { stdout } = await docker(['run', '--detach', '--rm', '-e', 'PORT=8080', '-p', '127.0.0.1::8080', image])
  containerId = stdout.trim()
  const { stdout: portOutput } = await docker(['port', containerId, '8080/tcp'])
  const port = portOutput.trim().match(/:(\d+)$/)?.[1]
  if (!port) throw new Error('Docker did not publish the transcoder HTTP port.')
  const origin = `http://127.0.0.1:${port}`
  await waitForHealth(origin)
  const response = await fetch(`${origin}/jobs`, {
    body: JSON.stringify({ input: { processingJobId: 'sentinel' } }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (response.status !== 503) {
    throw new Error(`Invalid sentinel job returned ${response.status}, expected 503.`)
  }
  console.log(`Verified ${image}: baked toolchain, /health, and sentinel queue route.`)
} finally {
  if (containerId) await docker(['rm', '--force', containerId]).catch(() => undefined)
}
