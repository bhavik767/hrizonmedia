import { parseMediaAssetId, parsePlaybackGrantId } from '@/media/identifiers'
import { authorizePlaybackResource, PlaybackAuthorizationError } from '@/media/playback'
import { mediaErrorResponse, withAuthenticatedUploader } from '@/media/request'

export async function GET(
  request: Request,
  context: { params: Promise<{ playbackGrantId: string; segment: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ payload }) => {
    try {
      const { playbackGrantId: rawGrantId, segment } = await context.params
      const playbackGrantId = parsePlaybackGrantId(rawGrantId)
      const url = new URL(request.url)
      const mediaAssetId = parseMediaAssetId(url.searchParams.get('asset') ?? '')
      const token = url.searchParams.get('token')
      if (
        !playbackGrantId ||
        !mediaAssetId ||
        !token ||
        !/^(init\.mp4|[1-9]\d*\.m4s)$/.test(segment)
      ) {
        throw new PlaybackAuthorizationError('Playback resource not found.', 404)
      }
      const authorized = await authorizePlaybackResource(payload, token, mediaAssetId)
      if (authorized.playbackGrantId !== playbackGrantId) {
        throw new PlaybackAuthorizationError('Playback authorization is invalid.', 403)
      }
      return new Response(new Uint8Array(), {
        headers: {
          'cache-control': 'private, no-store',
          'content-type': segment.endsWith('.mp4') ? 'video/mp4' : 'video/iso.segment',
        },
      })
    } catch (error) {
      return mediaErrorResponse(error)
    }
  })
}
