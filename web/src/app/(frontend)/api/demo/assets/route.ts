import { listOwnedAssets } from '@/media/library'
import { authenticatedUploader, mediaErrorResponse } from '@/media/request'

export async function GET(request: Request): Promise<Response> {
  try {
    const { member, payload } = await authenticatedUploader(request)
    return Response.json({ assets: await listOwnedAssets(payload, member) })
  } catch (error) {
    return mediaErrorResponse(error)
  }
}
