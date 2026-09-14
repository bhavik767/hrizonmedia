import { createUploadSession } from '@/media/library'
import { withAuthenticatedUploader } from '@/media/request'

export async function POST(request: Request): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    const body = (await request.json()) as Record<string, unknown>
    const result = await createUploadSession(payload, member, {
      fileName: String(body.fileName || ''),
      mimeType: String(body.mimeType || ''),
      size: Number(body.size),
    })
    return Response.json(result, { status: 201 })
  })
}
