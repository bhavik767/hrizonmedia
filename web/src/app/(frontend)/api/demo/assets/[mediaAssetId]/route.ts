import { getOwnedAsset } from '@/media/library'
import { authenticatedUploader, mediaErrorResponse } from '@/media/request'

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  try {
    const { member, payload } = await authenticatedUploader(request)
    const { mediaAssetId } = await context.params
    return Response.json({ asset: await getOwnedAsset(payload, member, mediaAssetId) })
  } catch (error) {
    return mediaErrorResponse(error)
  }
}
