import { parsePlaybackGrantId } from '@/media/identifiers'
import { acquirePlaybackLicence, PlaybackAuthorizationError } from '@/media/playback'
import { mediaErrorResponse, withAuthenticatedUploader } from '@/media/request'

export async function POST(
  request: Request,
  context: { params: Promise<{ playbackGrantId: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    try {
      const playbackGrantId = parsePlaybackGrantId((await context.params).playbackGrantId)
      const token = request.headers.get('x-playback-grant')
      if (!playbackGrantId || !token) {
        throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
      }
      const result = await acquirePlaybackLicence(payload, member, token, {
        challenge: new Uint8Array(await request.arrayBuffer()),
      })
      if (result.playbackGrantId !== playbackGrantId) {
        throw new PlaybackAuthorizationError('Playback authorization is invalid.', 403)
      }
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
