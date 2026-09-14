import { listOwnedAssets } from '@/media/library'
import { withAuthenticatedUploader } from '@/media/request'

export async function GET(request: Request): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    return Response.json({ assets: await listOwnedAssets(payload, member) })
  })
}
