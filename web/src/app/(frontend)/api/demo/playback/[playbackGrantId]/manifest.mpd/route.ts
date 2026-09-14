import {
  authorizePlaybackResourceRequest,
  mediaErrorResponse,
  withAuthenticatedUploader,
} from '@/media/request'

export async function GET(
  request: Request,
  context: { params: Promise<{ playbackGrantId: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    try {
      const { mediaAssetId, playbackGrantId, token } = await authorizePlaybackResourceRequest({
        member,
        payload,
        rawPlaybackGrantId: (await context.params).playbackGrantId,
        request,
      })
      const query = `asset=${mediaAssetId}&token=${encodeURIComponent(token)}`
      const segmentBase = `/api/demo/playback/${playbackGrantId}/segments`
      const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT10S" minBufferTime="PT1.5S">
  <Period>
    <AdaptationSet mimeType="video/mp4" codecs="avc1.640028" contentType="video">
      <ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" />
      <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />
      <Representation id="video-360" bandwidth="500000" width="640" height="360">
        <SegmentTemplate initialization="${segmentBase}/init.mp4?${query}" media="${segmentBase}/$Number$.m4s?${query}" startNumber="1" duration="10" timescale="1" />
      </Representation>
      <Representation id="video-480" bandwidth="900000" width="854" height="480">
        <SegmentTemplate initialization="${segmentBase}/init.mp4?${query}" media="${segmentBase}/$Number$.m4s?${query}" startNumber="1" duration="10" timescale="1" />
      </Representation>
      <Representation id="video-720" bandwidth="1800000" width="1280" height="720">
        <SegmentTemplate initialization="${segmentBase}/init.mp4?${query}" media="${segmentBase}/$Number$.m4s?${query}" startNumber="1" duration="10" timescale="1" />
      </Representation>
      <Representation id="video-1080" bandwidth="3500000" width="1920" height="1080">
        <SegmentTemplate initialization="${segmentBase}/init.mp4?${query}" media="${segmentBase}/$Number$.m4s?${query}" startNumber="1" duration="10" timescale="1" />
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" codecs="mp4a.40.2" contentType="audio" lang="en">
      <ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" />
      <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />
      <Representation id="audio" bandwidth="128000" audioSamplingRate="48000">
        <SegmentTemplate initialization="${segmentBase}/init.mp4?${query}" media="${segmentBase}/$Number$.m4s?${query}" startNumber="1" duration="10" timescale="1" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`
      return new Response(manifest, {
        headers: {
          'cache-control': 'private, no-store',
          'content-type': 'application/dash+xml',
        },
      })
    } catch (error) {
      return mediaErrorResponse(error)
    }
  })
}
