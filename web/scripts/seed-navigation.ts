import { getPayload } from 'payload'
import config from '@payload-config'

import { seedLegalPages, seedNavigationGlobals } from '../src/endpoints/seed/navigation.js'

/**
 * Populates the header and footer link sets, and the pages the legal links land
 * on. Idempotent: the globals are overwritten with the shipped sets and any
 * legal page that already exists is left alone.
 *
 * Run it against a fresh database, or after changing the shipped sets. The
 * chrome reads its globals through `unstable_cache` and the hook that drops
 * that cache only runs inside the Next process, so restart `npm run dev` after
 * running this. Edits made in the admin panel do not need a restart.
 */
const run = async () => {
  const payload = await getPayload({ config })

  await seedNavigationGlobals(payload)
  payload.logger.info('header and footer link sets written')

  await seedLegalPages(payload)
  payload.logger.info('legal pages present')

  payload.logger.info('done — restart the dev server to drop the cached globals')
  process.exit(0)
}

await run()
