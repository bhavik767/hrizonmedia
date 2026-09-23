import { deleteMediaFolder, renameMediaFolder } from '@/media/library'
import { parseJSONBody, withAuthenticatedPilotMember } from '@/media/request'

function folderID(value: string): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ folderID: string }> },
): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    const id = folderID((await context.params).folderID)
    if (!id) return Response.json({ error: 'Folder not found.' }, { status: 404 })
    const body = await parseJSONBody<Record<string, unknown>>(request)
    return Response.json({
      folder: await renameMediaFolder(payload, member, id, String(body.name || '')),
    })
  })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ folderID: string }> },
): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    const id = folderID((await context.params).folderID)
    if (!id) return Response.json({ error: 'Folder not found.' }, { status: 404 })
    await deleteMediaFolder(payload, member, id)
    return new Response(null, { status: 204 })
  })
}
