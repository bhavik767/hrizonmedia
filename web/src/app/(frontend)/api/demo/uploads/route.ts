import { createUploadSession } from '@/media/library'
import { parseJSONBody, withAuthenticatedMember } from '@/media/request'

export async function POST(request: Request): Promise<Response> {
  return withAuthenticatedMember(request, async ({ member, payload }) => {
    const body = await parseJSONBody<Record<string, unknown>>(request)
    const organisationID = Number(body.organisationID)
    const retentionDays = Number(body.retentionDays)
    if (!Number.isSafeInteger(organisationID) || organisationID <= 0) {
      return Response.json({ error: 'Choose an Organisation for this upload.' }, { status: 400 })
    }
    if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0) {
      return Response.json({ error: 'Choose a valid retention period.' }, { status: 400 })
    }
    if (body.mediaProtectionPolicy !== 'protected' && body.mediaProtectionPolicy !== 'standard') {
      return Response.json({ error: 'Choose a valid Media Protection Policy.' }, { status: 400 })
    }
    const result = await createUploadSession(payload, member, {
      fileFingerprint: String(body.fileFingerprint || ''),
      fileName: String(body.fileName || ''),
      mediaProtectionPolicy: body.mediaProtectionPolicy,
      mimeType: String(body.mimeType || ''),
      organisationID,
      retentionDays,
      size: Number(body.size),
    })
    return Response.json(result, { status: 201 })
  })
}
