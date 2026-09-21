import { parsePlaybackGrantId } from '@/media/identifiers'
import { PlaybackAuthorizationError } from '@/media/playback'
import { mediaErrorResponse, withAuthenticatedUploader } from '@/media/request'

const DEMO_FAIRPLAY_CERTIFICATE = Uint8Array.from(
  Buffer.from('hrizonmedia-demo-fairplay-certificate', 'utf8'),
)

export async function GET(
  request: Request,
  context: { params: Promise<{ playbackGrantId: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    try {
      const playbackGrantId = parsePlaybackGrantId((await context.params).playbackGrantId)
      if (!playbackGrantId) {
        throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
      }
      const grant = await payload.find({
        collection: 'playback-grants',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: {
          and: [{ playbackGrantId: { equals: playbackGrantId } }, { owner: { equals: member.id } }],
        },
      })
      if (!grant.docs[0] || new Date(grant.docs[0].expiresAt).getTime() <= Date.now()) {
        throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
      }
      return new Response(DEMO_FAIRPLAY_CERTIFICATE, {
        headers: {
          'cache-control': 'private, no-store',
          'content-type': 'application/octet-stream',
        },
      })
    } catch (error) {
      return mediaErrorResponse(error)
    }
  })
}
