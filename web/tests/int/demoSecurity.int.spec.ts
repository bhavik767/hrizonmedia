import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import { POST as createUpload } from '@/app/(frontend)/api/demo/uploads/route'
import { PUT as uploadPart } from '@/app/(frontend)/api/demo/uploads/[uploadSessionId]/parts/[partNumber]/content/route'
import config from '@/payload.config'

let payload: Payload

function uploadRequest(origin: string, fileName = 'lesson.txt') {
  return new Request('http://localhost:3000/api/demo/uploads', {
    body: JSON.stringify({
      fileFingerprint: 'security-test',
      fileName,
      mimeType: 'text/plain',
      size: 10,
    }),
    headers: {
      'content-type': 'application/json',
      origin,
    },
    method: 'POST',
  })
}

describe('Demo mutation security', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
    const member = await payload.create({
      collection: 'pilot-members',
      data: {
        email: 'security-uploader@example.test',
        invitationAcceptedAt: new Date().toISOString(),
        name: 'Security uploader',
        password: 'uploader-password',
        role: 'uploader',
        status: 'active',
      },
      overrideAccess: true,
    })
    vi.spyOn(payload, 'auth').mockResolvedValue({ user: member } as never)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
  })

  it('rejects a cross-origin mutation without granting CORS access', async () => {
    const response = await createUpload(uploadRequest('https://attacker.example'))

    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('returns a sanitized validation error for malformed JSON', async () => {
    const response = await createUpload(
      new Request('http://localhost:3000/api/demo/uploads', {
        body: '{"fileName":',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Request body must be valid JSON.' })
  })

  it('rejects an oversized upload part before processing it', async () => {
    const response = await uploadPart(
      new Request(
        'http://localhost:3000/api/demo/uploads/upload_00000000-0000-0000-0000-000000000000/parts/1/content',
        {
          body: new Uint8Array(5 * 1024 * 1024 + 1),
          headers: { origin: 'http://localhost:3000' },
          method: 'PUT',
        },
      ),
      {
        params: Promise.resolve({
          partNumber: '1',
          uploadSessionId: 'upload_00000000-0000-0000-0000-000000000000',
        }),
      },
    )

    expect(response.status).toBe(413)
  })

  it('rate limits repeated same-member mutations', async () => {
    const responses = []
    for (let request = 0; request < 31; request += 1) {
      responses.push(await createUpload(uploadRequest('http://localhost:3000')))
    }

    expect(responses.slice(0, 30).every(({ status }) => status === 400)).toBe(true)
    expect(responses[30]?.status).toBe(429)
    expect(responses[30]?.headers.get('retry-after')).toMatch(/^\d+$/)
  })
})
