import { parseMediaAssetId } from '@/media/identifiers'
import { deleteMediaAsset } from '@/media/lifecycle'
import { getVisibleAsset, moveMediaAssetToFolder } from '@/media/library'
import { parseJSONBody, withAuthenticatedMember } from '@/media/request'

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    const { mediaAssetId } = await context.params
    const parsedID = parseMediaAssetId(mediaAssetId)
    if (!parsedID) return Response.json({ error: 'Media Asset not found.' }, { status: 404 })
    return Response.json({ asset: await getVisibleAsset(payload, member, parsedID) })
  })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    const parsedID = parseMediaAssetId((await context.params).mediaAssetId)
    if (!parsedID) return Response.json({ error: 'Media Asset not found.' }, { status: 404 })
    await deleteMediaAsset(payload, member, parsedID)
    return new Response(null, { status: 204 })
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    const parsedID = parseMediaAssetId((await context.params).mediaAssetId)
    if (!parsedID) return Response.json({ error: 'Media Asset not found.' }, { status: 404 })
    const body = await parseJSONBody<Record<string, unknown>>(request)
    const folderID = body.folderID === null ? null : Number(body.folderID)
    if (folderID !== null && (!Number.isSafeInteger(folderID) || folderID <= 0)) {
      return Response.json({ error: 'Choose a valid Folder.' }, { status: 400 })
    }
    return Response.json({
      asset: await moveMediaAssetToFolder(payload, member, parsedID, folderID),
    })
  })
}
