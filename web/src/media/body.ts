import 'server-only'

function oversizedBody(): Response {
  return Response.json({ error: 'Request body is too large.' }, { status: 413 })
}

export async function readBoundedBody(request: Request, maximumBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw oversizedBody()
  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximumBytes) {
        await reader.cancel()
        throw oversizedBody()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function parseJSONBody<T extends object>(
  request: Request,
  maximumBytes = 16 * 1024,
): Promise<T> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    throw Response.json({ error: 'Request body must use application/json.' }, { status: 415 })
  }
  const body = await readBoundedBody(request, maximumBytes)
  let input: unknown
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
  } catch {
    throw Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw Response.json({ error: 'Request body must be a JSON object.' }, { status: 400 })
  }
  return input as T
}
