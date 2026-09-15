import { parseUploadSessionId } from '@/media/identifiers'
import { receiveUploadPart } from '@/media/library'
import { readBoundedBody, withAuthenticatedUploader } from '@/media/request'

const MAX_UPLOAD_PART_BYTES = 5 * 1024 * 1024

export async function PUT(
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
    const part = await receiveUploadPart(
      payload,
      member,
      parsedID,
      parsedPartNumber,
      await readBoundedBody(request, MAX_UPLOAD_PART_BYTES),
    )
    return Response.json(part)
  })
}
