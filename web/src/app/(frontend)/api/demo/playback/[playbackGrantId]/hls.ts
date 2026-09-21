import type { PilotMember } from '@/payload-types'
import {
  authorizePlaybackResourceRequest,
  type authenticatedUploader,
} from '@/media/request'
import { PlaybackAuthorizationError } from '@/media/playback'

type Payload = Awaited<ReturnType<typeof authenticatedUploader>>['payload']

export async function authorizeHlsPlaylistRequest(input: {
  member: PilotMember
  payload: Payload
  rawPlaybackGrantId: string
  request: Request
}) {
  const authorization = await authorizePlaybackResourceRequest(input)
  if (authorization.manifestFormat !== 'hls') {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 403)
  }
  return {
    ...authorization,
    query: `asset=${authorization.mediaAssetId}&token=${encodeURIComponent(authorization.token)}`,
  }
}

export function hlsResponse(playlist: string): Response {
  return new Response(playlist, {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'application/vnd.apple.mpegurl',
    },
  })
}
