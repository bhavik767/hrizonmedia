import { parseUploadSessionId } from '@/media/identifiers'
import { renewUploadPart } from '@/media/library'
import { parseJSONBody, withAuthenticatedPilotMember } from '@/media/request'

export async function POST(
  request: Request,
  context: { params: Promise<{ partNumber: string; uploadSessionId: string }> },
): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    const { partNumber, uploadSessionId } = await context.params
    const parsedID = parseUploadSessionId(uploadSessionId)
    const parsedPartNumber = Number(partNumber)
    if (!parsedID) return Response.json({ error: 'Upload session not found.' }, { status: 404 })
    if (!Number.isSafeInteger(parsedPartNumber) || parsedPartNumber < 1) {
      return Response.json({ error: 'Invalid upload part number.' }, { status: 400 })
    }
    let part: { checksumSHA256?: string; size?: number } = {}
    if (request.headers.get('content-type')) {
      part = await parseJSONBody(request)
      if (
        typeof part.checksumSHA256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(part.checksumSHA256) ||
        !Number.isSafeInteger(part.size) ||
        part.size! <= 0 ||
        part.size! > 5 * 1024 * 1024
      ) {
        return Response.json({ error: 'Upload part metadata is invalid.' }, { status: 400 })
      }
    }
    return Response.json(await renewUploadPart(payload, member, parsedID, parsedPartNumber, part))
  })
}
