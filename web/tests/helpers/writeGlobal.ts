import { getPayload } from 'payload'

import config from '../../src/payload.config.js'

const SERVER_URL = 'http://localhost:3000'

const seedUser = {
  email: 'globals-fixture@hrizonmedia.test',
  password: 'globals-fixture',
}

/**
 * Writes a global through the running server's REST API rather than the Local
 * API.
 *
 * This is not ceremony. Globals are read through `unstable_cache`, and the hook
 * that drops that cache runs inside the Next process. A write from the test
 * process would land in the database and leave the rendered page showing the
 * previous values, so the spec would be asserting against a stale page. It is
 * also the path the admin panel itself takes, which is the thing the "editable
 * without a deploy" requirement is actually about.
 */
export async function writeGlobal(slug: string, data: unknown): Promise<void> {
  const response = await fetch(`${SERVER_URL}/api/globals/${slug}`, {
    body: JSON.stringify(data),
    headers: { Authorization: `JWT ${await adminToken()}`, 'Content-Type': 'application/json' },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(
      `Could not update the ${slug} global: ${response.status} ${await response.text()}`,
    )
  }
}

/**
 * Globals are writable only by an authenticated user, so the fixture makes one.
 * It is removed again by `cleanupGlobalsUser`.
 */
export async function adminToken(): Promise<string> {
  const payload = await getPayload({ config })

  await payload.delete({ collection: 'users', where: { email: { equals: seedUser.email } } })
  await payload.create({ collection: 'users', data: seedUser })

  const { token } = await payload.login({ collection: 'users', data: seedUser })

  if (!token) throw new Error('Could not authenticate the globals fixture user')

  return token
}

export async function cleanupGlobalsUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({ collection: 'users', where: { email: { equals: seedUser.email } } })
}
