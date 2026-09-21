import { mediaErrorResponse, withAuthenticatedUploader } from '@/media/request'
import { authorizeHlsPlaylistRequest, hlsResponse } from '../hls'

export async function GET(
  request: Request,
  context: { params: Promise<{ playbackGrantId: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    try {
      const { mediaAssetId, playbackGrantId, query } = await authorizeHlsPlaylistRequest({
          member,
          payload,
          rawPlaybackGrantId: (await context.params).playbackGrantId,
          request,
        })
      return hlsResponse(
        `#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-VERSION:6\n#EXT-X-MAP:URI="/api/demo/playback/${playbackGrantId}/segments/video-360-init.mp4?${query}"\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://${mediaAssetId}",KEYFORMAT="com.apple.streamingkeydelivery",KEYFORMATVERSIONS="1"\n#EXTINF:10,\n/api/demo/playback/${playbackGrantId}/segments/video-360-1.m4s?${query}\n#EXT-X-ENDLIST\n`,
      )
    } catch (error) {
      return mediaErrorResponse(error)
    }
  })
}
