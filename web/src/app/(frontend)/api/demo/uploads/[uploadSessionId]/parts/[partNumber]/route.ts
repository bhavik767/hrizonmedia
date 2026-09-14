import { parseUploadSessionId } from '@/media/identifiers'
import { renewUploadPart } from '@/media/library'
import { withAuthenticatedUploader } from '@/media/request'

export async function POST(
  request: Request,
  context: { params: Promise<{ partNumber: string; uploadSessionId: string }> },
): Promise<Response> {
  return withAuthenticatedUploader(request, async ({ member, payload }) => {
    const { partNumber, uploadSessionId } = await context.params
    const parsedID = parseUploadSessionId(uploadSessionId)
    const parsedPartNumber = Number(partNumber)
    if (!parsedID) return Response.json({ error: 'Upload session not found.' }, { status: 404 })
    if (!Number.isSafeInteger(parsedPartNumber) || parsedPartNumber < 1) {
      return Response.json({ error: 'Invalid upload part number.' }, { status: 400 })
    }
    return Response.json(await renewUploadPart(payload, member, parsedID, parsedPartNumber))
  })
}
