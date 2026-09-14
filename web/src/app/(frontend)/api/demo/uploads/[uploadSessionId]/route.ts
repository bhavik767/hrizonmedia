import { parseUploadSessionId } from '@/media/identifiers'
import { completeUpload } from '@/media/library'
import { withAuthenticatedUploader } from '@/media/request'

export async function PUT(
  request: Request,
  context: { params: Promise<{ uploadSessionId: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File))
      return Response.json({ error: 'Video file is required.' }, { status: 400 })

    const { uploadSessionId } = await context.params
    const parsedID = parseUploadSessionId(uploadSessionId)
    if (!parsedID) return Response.json({ error: 'Upload session not found.' }, { status: 404 })
    const asset = await completeUpload(payload, member, parsedID, file)
    return Response.json({ asset })
  })
}
