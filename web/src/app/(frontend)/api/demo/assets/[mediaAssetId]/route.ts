import { parseMediaAssetId } from '@/media/identifiers'
import { deleteMediaAsset, runMediaLifecycle } from '@/media/lifecycle'
import { getVisibleAsset } from '@/media/library'
import { withAuthenticatedPilotMember } from '@/media/request'

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    const { mediaAssetId } = await context.params
    const parsedID = parseMediaAssetId(mediaAssetId)
    if (!parsedID) return Response.json({ error: 'Media Asset not found.' }, { status: 404 })
    await runMediaLifecycle(payload)
    return Response.json({ asset: await getVisibleAsset(payload, member, parsedID) })
  })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    const parsedID = parseMediaAssetId((await context.params).mediaAssetId)
    if (!parsedID) return Response.json({ error: 'Media Asset not found.' }, { status: 404 })
    await deleteMediaAsset(payload, member, parsedID)
    return new Response(null, { status: 204 })
  })
}
