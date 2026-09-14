import { parseMediaAssetId } from '@/media/identifiers'
import { getOwnedAsset } from '@/media/library'
import { withAuthenticatedUploader } from '@/media/request'

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    const { mediaAssetId } = await context.params
    const parsedID = parseMediaAssetId(mediaAssetId)
    if (!parsedID) return Response.json({ error: 'Media Asset not found.' }, { status: 404 })
    return Response.json({ asset: await getOwnedAsset(payload, member, parsedID) })
  })
}
