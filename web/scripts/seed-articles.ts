import { getPayload } from 'payload'
import config from '@payload-config'

import { launchArticles, seedLaunchArticles } from '../src/endpoints/seed/articles'

/**
 * Puts the launch Articles into the database. The Articles themselves live in
 * `src/endpoints/seed/articles.ts`, so the test suite renders exactly what this
 * script writes rather than its own approximation of it.
 */
const run = async () => {
  const payload = await getPayload({ config })

  await seedLaunchArticles(payload)

  payload.logger.info(`done — ${launchArticles.length} launch Articles present`)
  process.exit(0)
}

await run()
