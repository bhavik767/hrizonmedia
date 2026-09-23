import { getPayload } from 'payload'

import config from '@/payload.config'
import type { Member } from '@/payload-types'
import { OperationalControlsError } from '@/organisations/operations'
import { OrganisationAuthorizationError } from '@/organisations/authorization'
import { PlatformAdministrationError } from '@/organisations/platform-administration'
import { OrganisationSettingsError } from '@/organisations/settings'

import { parseMediaAssetId, parsePlaybackGrantId, type DeliveryToken } from './identifiers'
import { authorizePlaybackResource, PlaybackAuthorizationError } from './playback'
import { PlaybackCompatibilityError } from './playback-browser'
import { MediaLibraryError } from './library'
import {
  assertDemoMutationOrigin,
  enforceDemoMutationRateLimit,
  hardenDemoResponse,
} from './requestSecurity'

type AuthenticatedMember = {
  member: Member
  payload: Awaited<ReturnType<typeof getPayload>>
}

export { parseJSONBody, readBoundedBody } from './body'

export async function authenticatedMember(request: Request): Promise<AuthenticatedMember> {
  const payload = await getPayload({ config })
  const { user: member } = await payload.auth({ headers: request.headers })
  if (
    member?.collection !== 'members' ||
    member.status !== 'active'
  ) {
    throw new Response('Member authentication required.', { status: 401 })
  }
  return { member, payload }
}

export function mediaErrorResponse(error: unknown): Response {
  if (error instanceof Response) return error
  if (
    error instanceof MediaLibraryError ||
    error instanceof PlaybackCompatibilityError ||
    error instanceof PlaybackAuthorizationError ||
    error instanceof OperationalControlsError ||
    error instanceof OrganisationAuthorizationError ||
    error instanceof PlatformAdministrationError ||
    error instanceof OrganisationSettingsError
  ) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error('A Demo media request failed unexpectedly.')
  return Response.json({ error: 'Unable to complete the media request.' }, { status: 500 })
}

async function withAuthenticatedRequest(
  request: Request,
  authenticate: (request: Request) => Promise<AuthenticatedMember>,
  handler: (context: AuthenticatedMember) => Promise<Response>,
): Promise<Response> {
  try {
    assertDemoMutationOrigin(request)
    const context = await authenticate(request)
    enforceDemoMutationRateLimit(request, context.member)
    return hardenDemoResponse(await handler(context), request)
  } catch (error) {
    return hardenDemoResponse(mediaErrorResponse(error), request)
  }
}

export async function withAuthenticatedMember(
  request: Request,
  handler: (context: AuthenticatedMember) => Promise<Response>,
): Promise<Response> {
  return withAuthenticatedRequest(request, authenticatedMember, handler)
}

export async function authorizePlaybackResourceRequest(input: {
  member: Member
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
  return { ...authorized, mediaAssetId, playbackGrantId, token }
}
