import { parsePlaybackGrantId, type PlaybackGrantToken } from '@/media/identifiers'
import { acquirePlaybackLicence, PlaybackAuthorizationError } from '@/media/playback'
import { mediaErrorResponse, readBoundedBody, withAuthenticatedMember } from '@/media/request'

const MAX_DRM_CHALLENGE_BYTES = 64 * 1024

export async function POST(
  request: Request,
  context: { params: Promise<{ playbackGrantId: string }> },
): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    try {
      const playbackGrantId = parsePlaybackGrantId((await context.params).playbackGrantId)
      const token = request.headers.get('x-playback-grant') as PlaybackGrantToken | null
      if (!playbackGrantId || !token) {
        throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
      }
      const result = await acquirePlaybackLicence(payload, member, token, {
        challenge: await readBoundedBody(request, MAX_DRM_CHALLENGE_BYTES),
        requestedPlaybackGrantId: playbackGrantId,
      })
      return new Response(result.licence, {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'application/octet-stream',
        },
      })
    } catch (error) {
      return mediaErrorResponse(error)
    }
  })
}
