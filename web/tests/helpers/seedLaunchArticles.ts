import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { seedLaunchArticles as seed } from '../../src/endpoints/seed/articles.js'

export { launchArticles } from '../../src/endpoints/seed/articles.js'

/**
 * The ten Articles the site ships with, seeded from the same module the seed
 * script uses. The suite renders the real launch content rather than a stand-in
 * for it, because "all ten render correctly, unmodified" is the requirement.
 */
export async function seedLaunchArticles(): Promise<void> {
  await seed(await getPayload({ config }))
}
