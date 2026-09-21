import {
  authorizePlaybackResourceRequest,
  mediaErrorResponse,
  withAuthenticatedUploader,
} from '@/media/request'
import { getVisibleAsset } from '@/media/library'
import type { Rendition } from '@/media/providers/contracts'

const videoBandwidth: Record<Rendition['height'], number> = {
  240: 300_000,
  270: 400_000,
  360: 500_000,
  480: 900_000,
  720: 1_800_000,
  1080: 3_500_000,
}

function segmentTemplate(segmentBase: string, stream: string, query: string): string {
  return `<SegmentTemplate initialization="${segmentBase}/${stream}-init.mp4?${query}" media="${segmentBase}/${stream}-$Number$.m4s?${query}" startNumber="1" duration="10" timescale="1" />`
}

function videoRepresentation(rendition: Rendition, segmentBase: string, query: string): string {
  const stream = `video-${rendition.height}`
  return `      <Representation id="${stream}" bandwidth="${videoBandwidth[rendition.height]}" width="${rendition.width}" height="${rendition.height}">
        ${segmentTemplate(segmentBase, stream, query)}
      </Representation>`
}

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
      const asset = await getVisibleAsset(payload, member, mediaAssetId)
      if (!asset.renditions?.length) {
        throw new Error('Ready Media Asset has no renditions.')
      }
      const query = `asset=${mediaAssetId}&token=${encodeURIComponent(token)}`
      const segmentBase = `/api/demo/playback/${playbackGrantId}/segments`
      const videoRepresentations = asset.renditions
        .map((rendition) => videoRepresentation(rendition, segmentBase, query))
        .join('\n')
      const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT10S" minBufferTime="PT1.5S">
  <Period>
    <AdaptationSet mimeType="video/mp4" codecs="avc1.640028" contentType="video">
      <ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" />
      <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />
${videoRepresentations}
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" codecs="mp4a.40.2" contentType="audio" lang="en">
      <ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" />
      <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" />
      <Representation id="audio" bandwidth="128000" audioSamplingRate="48000">
        ${segmentTemplate(segmentBase, 'audio', query)}
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
