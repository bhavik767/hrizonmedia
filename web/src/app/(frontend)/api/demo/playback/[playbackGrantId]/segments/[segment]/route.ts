import { PlaybackAuthorizationError } from '@/media/playback'
import {
  authorizePlaybackResourceRequest,
  mediaErrorResponse,
  withAuthenticatedPilotMember,
} from '@/media/request'

export async function GET(
  request: Request,
  context: { params: Promise<{ playbackGrantId: string; segment: string }> },
): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    try {
      const { playbackGrantId: rawGrantId, segment } = await context.params
      if (!/^(audio|video-(360|480|720|1080))-(init\.mp4|[1-9]\d*\.m4s)$/.test(segment)) {
        throw new PlaybackAuthorizationError('Playback resource not found.', 404)
      }
      await authorizePlaybackResourceRequest({
        member,
        payload,
        rawPlaybackGrantId: rawGrantId,
        request,
      })
      return new Response(new Uint8Array(), {
        headers: {
          'cache-control': 'private, no-store',
          'content-type': segment.startsWith('audio-')
            ? segment.endsWith('.mp4')
              ? 'audio/mp4'
              : 'audio/iso.segment'
            : segment.endsWith('.mp4')
              ? 'video/mp4'
              : 'video/iso.segment',
        },
      })
    } catch (error) {
      return mediaErrorResponse(error)
    }
  })
}
