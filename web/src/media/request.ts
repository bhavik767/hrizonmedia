import { getPayload } from 'payload'

import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'

export async function authenticatedUploader(request: Request): Promise<{
  member: PilotMember
  payload: Awaited<ReturnType<typeof getPayload>>
}> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (
    user?.collection !== 'pilot-members' ||
    user.status !== 'active' ||
    user.role !== 'uploader'
  ) {
    throw new Response('Uploader authentication required.', { status: 401 })
  }
  return { member: user, payload }
}

export function mediaErrorResponse(error: unknown): Response {
  if (error instanceof Response) return error
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error(error)
  return Response.json({ error: 'Unable to complete the media request.' }, { status: 500 })
}
