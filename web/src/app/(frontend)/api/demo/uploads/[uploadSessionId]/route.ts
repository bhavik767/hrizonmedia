import { parseUploadSessionId } from '@/media/identifiers'
import { abortUpload, resumeUploadSession } from '@/media/library'
import { withAuthenticatedUploader } from '@/media/request'

type UploadContext = { params: Promise<{ uploadSessionId: string }> }

async function parsedUploadSessionID(context: UploadContext) {
  const { uploadSessionId } = await context.params
  return parseUploadSessionId(uploadSessionId)
}

export async function GET(request: Request, context: UploadContext): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    const parsedID = await parsedUploadSessionID(context)
    if (!parsedID) return Response.json({ error: 'Upload session not found.' }, { status: 404 })
    const fileFingerprint = new URL(request.url).searchParams.get('fileFingerprint') || ''
    return Response.json(await resumeUploadSession(payload, member, parsedID, fileFingerprint))
  })
}

export async function DELETE(request: Request, context: UploadContext): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    const parsedID = await parsedUploadSessionID(context)
    if (!parsedID) return Response.json({ error: 'Upload session not found.' }, { status: 404 })
    await abortUpload(payload, member, parsedID)
    return new Response(null, { status: 204 })
  })
}
