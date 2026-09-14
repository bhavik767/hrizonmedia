import { parseMediaAssetId } from '@/media/identifiers'
import { createPlaybackGrant } from '@/media/playback'
import { withAuthenticatedUploader } from '@/media/request'

export async function POST(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    const mediaAssetId = parseMediaAssetId((await context.params).mediaAssetId)
    if (!mediaAssetId) return Response.json({ error: 'Media Asset not found.' }, { status: 404 })
    return Response.json(await createPlaybackGrant(payload, member, mediaAssetId), {
      headers: { 'cache-control': 'no-store' },
      status: 201,
    })
  })
}
