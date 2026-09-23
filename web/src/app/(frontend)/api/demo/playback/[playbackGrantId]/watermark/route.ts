import { parsePlaybackGrantId, type PlaybackGrantToken } from '@/media/identifiers'
import { PlaybackAuthorizationError, refreshPlaybackWatermark } from '@/media/playback'
import { mediaErrorResponse, withAuthenticatedPilotMember } from '@/media/request'

export async function POST(
  request: Request,
  context: { params: Promise<{ playbackGrantId: string }> },
): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    try {
      const playbackGrantId = parsePlaybackGrantId((await context.params).playbackGrantId)
      const token = request.headers.get('x-playback-grant') as PlaybackGrantToken | null
      if (!playbackGrantId || !token) {
        throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
      }
      return Response.json(
        await refreshPlaybackWatermark(payload, member, token, {
          requestedPlaybackGrantId: playbackGrantId,
        }),
        { headers: { 'cache-control': 'no-store' } },
      )
    } catch (error) {
      return mediaErrorResponse(error)
    }
  })
}
