import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import { POST as createUpload } from '@/app/(frontend)/api/demo/uploads/route'
import { PUT as uploadPart } from '@/app/(frontend)/api/demo/uploads/[uploadSessionId]/parts/[partNumber]/content/route'
import { POST as renewPart } from '@/app/(frontend)/api/demo/uploads/[uploadSessionId]/parts/[partNumber]/route'
import { POST as completeUpload } from '@/app/(frontend)/api/demo/uploads/[uploadSessionId]/complete/route'
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
    await payload.delete({ collection: 'members', overrideAccess: true, where: {} })
    const member = await payload.create({
      collection: 'members',
      data: {
        email: 'security-uploader@example.test',
        name: 'Security uploader',
        password: 'uploader-password',
        status: 'active',
      },
      overrideAccess: true,
    })
    vi.spyOn(payload, 'auth').mockResolvedValue({ user: member } as never)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await payload.delete({ collection: 'members', overrideAccess: true, where: {} })
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

  it('allows part-target acquisition beyond the general mutation burst', async () => {
    const uploadSessionId = 'upload_00000000-0000-0000-0000-000000000000'
    for (let partNumber = 1; partNumber <= 31; partNumber += 1) {
      const response = await renewPart(
        new Request(
          `http://localhost:3000/api/demo/uploads/${uploadSessionId}/parts/${partNumber}`,
          {
            headers: { origin: 'http://localhost:3000' },
            method: 'POST',
          },
        ),
        { params: Promise.resolve({ partNumber: String(partNumber), uploadSessionId }) },
      )
      expect(response.status).toBe(404)
    }
  })

  it('accepts the completion manifest size required for a supported 2 GB upload', async () => {
    const uploadSessionId = 'upload_00000000-0000-0000-0000-000000000000'
    const parts = Array.from({ length: 410 }, (_, index) => ({
      checksumSHA256: 'a'.repeat(64),
      etag: 'b'.repeat(64),
      partNumber: index + 1,
      size: 5 * 1024 * 1024,
    }))
    const response = await completeUpload(
      new Request(`http://localhost:3000/api/demo/uploads/${uploadSessionId}/complete`, {
        body: JSON.stringify({ parts }),
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        method: 'POST',
      }),
      { params: Promise.resolve({ uploadSessionId }) },
    )
    expect(response.status).toBe(404)
  })

  it('cancels an oversized chunked upload instead of consuming the entire stream', async () => {
    const cancel = vi.fn()
    let chunks = 0
    const stream = new ReadableStream({
      pull(controller) {
        if (chunks++ < 4) controller.enqueue(new Uint8Array(3 * 1024 * 1024))
        else controller.close()
      },
      cancel,
    })
    const uploadSessionId = 'upload_00000000-0000-0000-0000-000000000000'
    const response = await uploadPart(
      new Request(`http://localhost:3000/api/demo/uploads/${uploadSessionId}/parts/1/content`, {
        body: stream,
        duplex: 'half',
        headers: { origin: 'http://localhost:3000' },
        method: 'PUT',
      } as RequestInit),
      { params: Promise.resolve({ partNumber: '1', uploadSessionId }) },
    )
    expect(response.status).toBe(413)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('rejects a JSON null mutation as validation rather than a server error', async () => {
    const response = await createUpload(
      new Request('http://localhost:3000/api/demo/uploads', {
        body: 'null',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        method: 'POST',
      }),
    )
    expect(response.status).toBe(400)
  })

  it('does not expose unexpected credential-bearing errors with a status property', async () => {
    vi.mocked(payload.auth).mockRejectedValueOnce(
      Object.assign(new Error('provider-secret=never-expose'), {
        status: 500,
      }),
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await createUpload(uploadRequest('http://localhost:3000'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Unable to complete the media request.' })
    expect(log.mock.calls.flat().map(String).join(' ')).not.toContain('never-expose')
    log.mockRestore()
  })
})
