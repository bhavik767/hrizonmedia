import { parseMediaAssetId } from '@/media/identifiers'
import { getVisibleAssetThumbnail } from '@/media/library'
import { withAuthenticatedMember } from '@/media/request'

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    const parsedID = parseMediaAssetId((await context.params).mediaAssetId)
    if (!parsedID) return new Response(null, { status: 404 })
    const thumbnail = await getVisibleAssetThumbnail(payload, member, parsedID)
    if (!thumbnail) return new Response(null, { status: 404 })
    return new Response(thumbnail, {
      headers: {
        'cache-control': 'private, max-age=300',
        'content-type': 'image/jpeg',
      },
    })
  })
}
