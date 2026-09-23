import { listVisibleAssets } from '@/media/library'
import { withAuthenticatedMember } from '@/media/request'

export async function GET(request: Request): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    const organisationID = Number(new URL(request.url).searchParams.get('organisationID'))
    return Response.json({
      assets: await listVisibleAssets(
        payload,
        member,
        Number.isSafeInteger(organisationID) && organisationID > 0 ? organisationID : undefined,
      ),
    })
  })
}
