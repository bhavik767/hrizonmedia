import { mediaErrorResponse, withAuthenticatedMember } from '@/media/request'
import { authorizeHlsPlaylistRequest, hlsResponse } from '../hls'

export async function GET(
  request: Request,
  context: { params: Promise<{ playbackGrantId: string }> },
): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    try {
      const { playbackGrantId, query } = await authorizeHlsPlaylistRequest({
        member,
        payload,
        rawPlaybackGrantId: (await context.params).playbackGrantId,
        request,
      })
      return hlsResponse(
        `#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-STREAM-INF:BANDWIDTH=500000,CODECS="avc1.640028,mp4a.40.2"\n/api/demo/playback/${playbackGrantId}/fairplay.m3u8?${query}\n`,
      )
    } catch (error) {
      return mediaErrorResponse(error)
    }
  })
}
