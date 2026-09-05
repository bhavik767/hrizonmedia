import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import {
  categories,
  legal,
  navItemsFor,
  seedLegalPages,
} from '../../src/endpoints/seed/navigation.js'

export { categories, legal } from '../../src/endpoints/seed/navigation.js'

const SERVER_URL = 'http://localhost:3000'

const seedUser = {
  email: 'chrome-fixture@hrizonmedia.test',
  password: 'chrome-fixture',
}

/**
 * Writes link sets into the `header` and `footer` globals through the running
 * server's REST API rather than the Local API.
 *
 * This is not ceremony. The chrome reads its globals through `unstable_cache`,
 * and the hook that drops that cache runs inside the Next process. A write from
 * this process would land in the database and leave the rendered page showing
 * the previous links, so the spec would be asserting against a stale page. It
 * is also the path the admin panel itself takes, which is the thing the
 * "editable without a deploy" requirement is actually about.
 */
export async function writeNavigation({
  footerNavItems = categories,
  headerNavItems = categories,
  legalItems = legal,
}: {
  footerNavItems?: { href: string; title: string }[]
  headerNavItems?: { href: string; title: string }[]
  legalItems?: { href: string; title: string }[]
} = {}): Promise<void> {
  const token = await adminToken()

  /*
   * Sequentially, not `Promise.all`. These are two writes to one SQLite file,
   * and firing them together is the same concurrent-writer problem that pins
   * Playwright to a single worker: the loser comes back `SQLITE_BUSY`, which
   * the REST layer reports only as a 500. It cost a flaky beforeAll to find.
   */
  await updateGlobal('header', { navItems: navItemsFor(headerNavItems) }, token)
  await updateGlobal(
    'footer',
    { navItems: navItemsFor(footerNavItems), legalItems: navItemsFor(legalItems) },
    token,
  )
}

/** Restores the link sets the site ships with, and the pages they land on. */
export async function seedNavigation(): Promise<void> {
  const payload = await getPayload({ config })

  await seedLegalPages(payload)
  await writeNavigation()
}

async function updateGlobal(slug: string, data: unknown, token: string): Promise<void> {
  const response = await fetch(`${SERVER_URL}/api/globals/${slug}`, {
    body: JSON.stringify(data),
    headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Could not update the ${slug} global: ${response.status} ${await response.text()}`)
  }
}

/**
 * Globals are writable only by an authenticated user, so the fixture makes one.
 * It is removed again in `cleanupNavigationUser`.
 */
async function adminToken(): Promise<string> {
  const payload = await getPayload({ config })

  await payload.delete({ collection: 'users', where: { email: { equals: seedUser.email } } })
  await payload.create({ collection: 'users', data: seedUser })

  const { token } = await payload.login({ collection: 'users', data: seedUser })

  if (!token) throw new Error('Could not authenticate the navigation fixture user')

  return token
}

export async function cleanupNavigationUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({ collection: 'users', where: { email: { equals: seedUser.email } } })
}
