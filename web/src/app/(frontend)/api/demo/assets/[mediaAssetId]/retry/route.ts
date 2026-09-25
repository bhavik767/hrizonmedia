import { parseMediaAssetId } from '@/media/identifiers'
import { retryVisibleAssetProcessing } from '@/media/library'
import { withAuthenticatedMember } from '@/media/request'

export async function POST(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    const parsedID = parseMediaAssetId((await context.params).mediaAssetId)
    if (!parsedID) return Response.json({ error: 'Media Asset not found.' }, { status: 404 })
    return Response.json({ asset: await retryVisibleAssetProcessing(payload, member, parsedID) })
  })
}
