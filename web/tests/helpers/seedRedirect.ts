import { getPayload } from 'payload'

import config from '../../src/payload.config.js'

const SERVER_URL = 'http://localhost:3000'

const seedUser = {
  email: 'redirect-fixture@hrizonmedia.test',
  password: 'redirect-fixture',
}

/**
 * Creates a redirect pointing at an Article, through the running server's REST
 * API rather than the Local API.
 *
 * The site reads its redirects through `unstable_cache`, and the hook that
 * drops that cache runs inside the Next process — a write from this process
 * would land in the database and leave the server still serving the redirects
 * it had already read. Same reasoning as the navigation fixture.
 */
export async function seedRedirectToArticle({
  from,
  slug,
}: {
  from: string
  slug: string
}): Promise<void> {
  const payload = await getPayload({ config })

  const article = await payload.find({
    collection: 'posts',
    limit: 1,
    pagination: false,
    where: { slug: { equals: slug } },
  })

  const id = article.docs[0]?.id

  if (!id) throw new Error(`No Article to redirect to: ${slug}`)

  const token = await adminToken()

  const response = await fetch(`${SERVER_URL}/api/redirects`, {
    body: JSON.stringify({
      from,
      to: { type: 'reference', reference: { relationTo: 'posts', value: id } },
    }),
    headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Could not create the redirect: ${response.status} ${await response.text()}`)
  }
}

export async function cleanupRedirects({ from }: { from: string }): Promise<void> {
  const token = await adminToken()

  const response = await fetch(
    `${SERVER_URL}/api/redirects?where[from][equals]=${encodeURIComponent(from)}`,
    { headers: { Authorization: `JWT ${token}` }, method: 'DELETE' },
  )

  if (!response.ok) {
    throw new Error(`Could not remove the redirect: ${response.status} ${await response.text()}`)
  }

  await cleanupRedirectUser()
}

async function adminToken(): Promise<string> {
  const payload = await getPayload({ config })

  await payload.delete({ collection: 'users', where: { email: { equals: seedUser.email } } })
  await payload.create({ collection: 'users', data: seedUser })

  const { token } = await payload.login({ collection: 'users', data: seedUser })

  if (!token) throw new Error('Could not authenticate the redirect fixture user')

  return token
}

async function cleanupRedirectUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({ collection: 'users', where: { email: { equals: seedUser.email } } })
}
