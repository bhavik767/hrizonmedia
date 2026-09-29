import {
  MAX_MULTIPART_PARTS,
  MULTIPART_PART_SIZE_BYTES,
  type CompletedPart,
} from '@/media/multipart'
import { parseUploadSessionId } from '@/media/identifiers'
import { completeUpload } from '@/media/library'
import { parseJSONBody, withAuthenticatedMember } from '@/media/request'

export async function POST(
  request: Request,
  context: { params: Promise<{ uploadSessionId: string }> },
): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    const { uploadSessionId } = await context.params
    const parsedID = parseUploadSessionId(uploadSessionId)
    if (!parsedID) return Response.json({ error: 'Upload session not found.' }, { status: 404 })
    const body = await parseJSONBody<{ parts?: CompletedPart[] }>(request, 128 * 1024)
    if (
      !Array.isArray(body.parts) ||
      body.parts.length === 0 ||
      body.parts.length > MAX_MULTIPART_PARTS ||
      body.parts.some(
        (part, index) =>
          typeof part !== 'object' ||
          part === null ||
          !Number.isSafeInteger(part.partNumber) ||
          part.partNumber !== index + 1 ||
          !Number.isSafeInteger(part.size) ||
          part.size <= 0 ||
          part.size > MULTIPART_PART_SIZE_BYTES ||
          typeof part.etag !== 'string' ||
          part.etag.length > 128 ||
          typeof part.checksumSHA256 !== 'string' ||
          !/^[0-9a-f]{64}$/.test(part.checksumSHA256),
      )
    ) {
      return Response.json({ error: 'Uploaded parts are required.' }, { status: 400 })
    }
    const asset = await completeUpload(payload, member, parsedID, body.parts)
    return Response.json({ asset })
  })
}
