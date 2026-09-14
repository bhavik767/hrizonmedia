import { parseMediaAssetId } from '@/media/identifiers'
import { retryOwnedAssetProcessing } from '@/media/library'
import { withAuthenticatedUploader } from '@/media/request'

export async function POST(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    const parsedID = parseMediaAssetId((await context.params).mediaAssetId)
    if (!parsedID) return Response.json({ error: 'Media Asset not found.' }, { status: 404 })
    return Response.json({ asset: await retryOwnedAssetProcessing(payload, member, parsedID) })
  })
}
