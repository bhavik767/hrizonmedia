import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'
import type { Member } from '@/payload-types'

export async function getMember(): Promise<Member | null> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (user?.collection !== 'members' || user.status !== 'active') return null

  return user
}
