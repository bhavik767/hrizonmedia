import { getMediaProviders } from '@/media/providers'
import {
  authorizePlaybackResourceRequest,
  mediaErrorResponse,
  withAuthenticatedPilotMember,
} from '@/media/request'

export async function GET(
  request: Request,
  context: { params: Promise<{ playbackGrantId: string }> },
): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    try {
      const authorization = await authorizePlaybackResourceRequest({
        member,
        payload,
        rawPlaybackGrantId: (await context.params).playbackGrantId,
        request,
      })
      return Response.json(
        await getMediaProviders().delivery.authorize({
          expiresAt: new Date(authorization.deliveryExpiresAt),
          mediaAssetId: authorization.mediaAssetId,
          manifestFormat: authorization.manifestFormat,
          playbackGrantId: authorization.playbackGrantId,
          processingJobId: authorization.processingJobId,
          token: authorization.token,
        }),
      )
    } catch (error) {
      return mediaErrorResponse(error)
    }
  })
}
