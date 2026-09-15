import { createUploadSession } from '@/media/library'
import { parseJSONBody, withAuthenticatedUploader } from '@/media/request'

export async function POST(request: Request): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    const body = await parseJSONBody<Record<string, unknown>>(request)
    const result = await createUploadSession(payload, member, {
      fileFingerprint: String(body.fileFingerprint || ''),
      fileName: String(body.fileName || ''),
      mimeType: String(body.mimeType || ''),
      size: Number(body.size),
    })
    return Response.json(result, { status: 201 })
  })
}
