import type { CompletedPart } from '@/media/multipart'
import { parseUploadSessionId } from '@/media/identifiers'
import { completeUpload } from '@/media/library'
import { parseJSONBody, withAuthenticatedPilotMember } from '@/media/request'

export async function POST(
  request: Request,
  context: { params: Promise<{ uploadSessionId: string }> },
): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    const { uploadSessionId } = await context.params
    const parsedID = parseUploadSessionId(uploadSessionId)
    if (!parsedID) return Response.json({ error: 'Upload session not found.' }, { status: 404 })
    const body = await parseJSONBody<{ parts?: CompletedPart[] }>(request, 128 * 1024)
    if (
      !Array.isArray(body.parts) ||
      body.parts.length === 0 ||
      body.parts.length > 410 ||
      body.parts.some(
        (part) =>
          typeof part !== 'object' ||
          part === null ||
          !Number.isSafeInteger(part.partNumber) ||
          part.partNumber < 1 ||
          !Number.isSafeInteger(part.size) ||
          part.size <= 0 ||
          part.size > 5 * 1024 * 1024 ||
          typeof part.etag !== 'string' ||
          part.etag.length > 128 ||
          typeof part.checksumSHA256 !== 'string' ||
          !/^[0-9a-f]{64}$/.test(part.checksumSHA256),
      ) ||
      new Set(body.parts.map((part) => part.partNumber)).size !== body.parts.length
    ) {
      return Response.json({ error: 'Uploaded parts are required.' }, { status: 400 })
    }
    const asset = await completeUpload(payload, member, parsedID, body.parts)
    return Response.json({ asset })
  })
}
