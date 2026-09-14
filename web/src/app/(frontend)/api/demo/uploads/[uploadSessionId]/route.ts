import type { UploadSessionId } from '@/media/identifiers'
import { completeUpload } from '@/media/library'
import { authenticatedUploader, mediaErrorResponse } from '@/media/request'

export async function PUT(
  request: Request,
  context: { params: Promise<{ uploadSessionId: string }> },
): Promise<Response> {
  try {
    const { member, payload } = await authenticatedUploader(request)
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File))
      return Response.json({ error: 'Video file is required.' }, { status: 400 })

    const { uploadSessionId } = await context.params
    const asset = await completeUpload(payload, member, uploadSessionId as UploadSessionId, file)
    return Response.json({ asset })
  } catch (error) {
    return mediaErrorResponse(error)
  }
}
