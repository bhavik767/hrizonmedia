import { createUploadSession } from '@/media/library'
import { authenticatedUploader, mediaErrorResponse } from '@/media/request'

export async function POST(request: Request): Promise<Response> {
  try {
    const { member, payload } = await authenticatedUploader(request)
    const body = (await request.json()) as Record<string, unknown>
    const result = await createUploadSession(payload, member, {
      fileName: String(body.fileName || ''),
      mimeType: String(body.mimeType || ''),
      size: Number(body.size),
    })
    return Response.json(result, { status: 201 })
  } catch (error) {
    return mediaErrorResponse(error)
  }
}
