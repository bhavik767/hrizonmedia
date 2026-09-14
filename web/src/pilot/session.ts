import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'

export async function getPilotMember(): Promise<PilotMember | null> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (user?.collection !== 'pilot-members' || user.status !== 'active') return null

  return user
}
