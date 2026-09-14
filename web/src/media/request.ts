import { getPayload } from 'payload'

import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'

import { parseMediaAssetId, parsePlaybackGrantId, type DeliveryToken } from './identifiers'
import { authorizePlaybackResource, PlaybackAuthorizationError } from './playback'

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

export async function withAuthenticatedUploader(
  request: Request,
  handler: (context: Awaited<ReturnType<typeof authenticatedUploader>>) => Promise<Response>,
): Promise<Response> {
  try {
    return await handler(await authenticatedUploader(request))
  } catch (error) {
    return mediaErrorResponse(error)
  }
}

export async function authorizePlaybackResourceRequest(input: {
  member: PilotMember
  payload: Awaited<ReturnType<typeof getPayload>>
  rawPlaybackGrantId: string
  request: Request
}) {
  const playbackGrantId = parsePlaybackGrantId(input.rawPlaybackGrantId)
  const url = new URL(input.request.url)
  const mediaAssetId = parseMediaAssetId(url.searchParams.get('asset') ?? '')
  const token = url.searchParams.get('token') as DeliveryToken | null
  if (!playbackGrantId || !mediaAssetId || !token) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
  }
  const authorized = await authorizePlaybackResource(
    input.payload,
    input.member,
    token,
    mediaAssetId,
  )
  if (authorized.playbackGrantId !== playbackGrantId) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 403)
  }
  return { mediaAssetId, playbackGrantId, token }
}
