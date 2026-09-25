import { createMediaFolder, listMediaFolders } from '@/media/library'
import { parseJSONBody, withAuthenticatedMember } from '@/media/request'

export async function GET(request: Request): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    const organisationID = Number(new URL(request.url).searchParams.get('organisationID'))
    return Response.json({ folders: await listMediaFolders(payload, member, organisationID) })
  })
}

export async function POST(request: Request): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    const body = await parseJSONBody<Record<string, unknown>>(request)
    const folder = await createMediaFolder(
      payload,
      member,
      Number(body.organisationID),
      String(body.name || ''),
    )
    return Response.json({ folder }, { status: 201 })
  })
}
