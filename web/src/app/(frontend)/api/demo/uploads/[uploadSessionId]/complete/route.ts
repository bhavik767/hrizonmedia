import type { CompletedPart } from '@/media/multipart'
import { parseUploadSessionId } from '@/media/identifiers'
import { completeUpload } from '@/media/library'
import { parseJSONBody, withAuthenticatedUploader } from '@/media/request'

export async function POST(
  request: Request,
  context: { params: Promise<{ uploadSessionId: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    const { uploadSessionId } = await context.params
    const parsedID = parseUploadSessionId(uploadSessionId)
    if (!parsedID) return Response.json({ error: 'Upload session not found.' }, { status: 404 })
    const body = await parseJSONBody<{ parts?: CompletedPart[] }>(request)
    if (!Array.isArray(body.parts)) {
      return Response.json({ error: 'Uploaded parts are required.' }, { status: 400 })
    }
    const asset = await completeUpload(payload, member, parsedID, body.parts)
    return Response.json({ asset })
  })
}
