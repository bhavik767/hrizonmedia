import { getPayload } from 'payload'

import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'

import { parseMediaAssetId, parsePlaybackGrantId, type DeliveryToken } from './identifiers'
import { authorizePlaybackResource, PlaybackAuthorizationError } from './playback'
import {
  assertDemoMutationOrigin,
  enforceDemoMutationRateLimit,
  hardenDemoResponse,
} from './requestSecurity'

type AuthenticatedMember = {
  member: PilotMember
  payload: Awaited<ReturnType<typeof getPayload>>
}

const MAX_JSON_BODY_BYTES = 16 * 1024

export async function parseJSONBody<T>(request: Request): Promise<T> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw Response.json({ error: 'Request body must use application/json.' }, { status: 415 })
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw Response.json({ error: 'Request body is too large.' }, { status: 413 })
  }
  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > MAX_JSON_BODY_BYTES) {
    throw Response.json({ error: 'Request body is too large.' }, { status: 413 })
  }
  try {
    return JSON.parse(body) as T
  } catch {
    throw Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
}

export async function readBoundedBody(request: Request, maximumBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw Response.json({ error: 'Request body is too large.' }, { status: 413 })
  }
  const body = new Uint8Array(await request.arrayBuffer())
  if (body.byteLength > maximumBytes) {
    throw Response.json({ error: 'Request body is too large.' }, { status: 413 })
  }
  return body
}

async function authenticatedMember(
  request: Request,
  requiredRole?: PilotMember['role'],
): Promise<AuthenticatedMember> {
  const payload = await getPayload({ config })
  const { user: member } = await payload.auth({ headers: request.headers })
  if (
    member?.collection !== 'pilot-members' ||
    member.status !== 'active' ||
    (requiredRole && member.role !== requiredRole)
  ) {
    const subject = requiredRole === 'uploader' ? 'Uploader' : 'Pilot Member'
    throw new Response(`${subject} authentication required.`, { status: 401 })
  }
  return { member, payload }
}

export function authenticatedUploader(request: Request): Promise<AuthenticatedMember> {
  return authenticatedMember(request, 'uploader')
}

export function authenticatedPilotMember(request: Request): Promise<AuthenticatedMember> {
  return authenticatedMember(request)
}

export function mediaErrorResponse(error: unknown): Response {
  if (error instanceof Response) return error
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error('A Demo media request failed unexpectedly.')
  return Response.json({ error: 'Unable to complete the media request.' }, { status: 500 })
}

async function withAuthenticatedMember(
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

export function withAuthenticatedUploader(
  request: Request,
  handler: (context: AuthenticatedMember) => Promise<Response>,
): Promise<Response> {
  return withAuthenticatedMember(request, authenticatedUploader, handler)
}

export async function withAuthenticatedPilotMember(
  request: Request,
  handler: (context: AuthenticatedMember) => Promise<Response>,
): Promise<Response> {
  return withAuthenticatedMember(request, authenticatedPilotMember, handler)
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
