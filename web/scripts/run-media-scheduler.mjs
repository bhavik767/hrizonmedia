import { pathToFileURL } from 'node:url'

const DEFAULT_INTERVAL_MS = 10_000
const REQUEST_TIMEOUT_MS = 8_000

function schedulerConfiguration(environment = process.env) {
  const cronSecret = environment.CRON_SECRET?.trim()
  const originValue = environment.MEDIA_SCHEDULER_ORIGIN?.trim() || 'http://app:3000'
  const intervalValue = Number(environment.MEDIA_SCHEDULER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS)

  let origin
  try {
    const parsed = new URL(originValue)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== originValue)
      throw new Error()
    origin = parsed.origin
  } catch {
    throw new Error('MEDIA_SCHEDULER_ORIGIN must be an HTTP origin.')
  }
  if (!cronSecret) throw new Error('CRON_SECRET is required by the media scheduler.')
  if (!Number.isSafeInteger(intervalValue) || intervalValue < 5_000) {
    throw new Error('MEDIA_SCHEDULER_INTERVAL_MS must be an integer of at least 5000.')
  }
  return { cronSecret, intervalMs: intervalValue, origin }
}

export async function runMediaSchedulerOnce(configuration, fetcher = globalThis.fetch) {
  const response = await fetcher(
    `${configuration.origin}/api/payload-jobs/run?queue=media-processing`,
    {
      headers: { authorization: `Bearer ${configuration.cronSecret}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  )
  if (!response.ok) {
    throw new Error(`Media scheduler request failed with status ${response.status}.`)
  }
}

async function run() {
  const configuration = schedulerConfiguration()
  for (;;) {
    try {
      await runMediaSchedulerOnce(configuration)
    } catch {
      console.error(
        JSON.stringify({
          event: 'media_scheduler_request_failed',
          level: 'error',
          timestamp: new Date().toISOString(),
        }),
      )
    }
    await new Promise((resolve) => setTimeout(resolve, configuration.intervalMs))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run()
}
