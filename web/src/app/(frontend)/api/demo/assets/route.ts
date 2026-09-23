import { listVisibleAssets } from '@/media/library'
import { withAuthenticatedMember } from '@/media/request'

export async function GET(request: Request): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    return Response.json({ assets: await listVisibleAssets(payload, member) })
  })
}
