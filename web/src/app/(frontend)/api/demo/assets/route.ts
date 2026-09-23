import { listVisibleAssets } from '@/media/library'
import { withAuthenticatedPilotMember } from '@/media/request'

export async function GET(request: Request): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    return Response.json({ assets: await listVisibleAssets(payload, member) })
  })
}
