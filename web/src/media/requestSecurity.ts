import 'server-only'

import type { Member } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'

const MUTATION_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT'])
const RATE_WINDOW_MS = 60_000

type RateEntry = { count: number; startedAt: number }

const rateStateKey = Symbol.for('hrizonmedia.demo-rate-state')
const sharedGlobal = globalThis as typeof globalThis & {
  [rateStateKey]?: Map<string, RateEntry>
}
const rateState = (sharedGlobal[rateStateKey] ??= new Map())

function trustedOrigins(request: Request): Set<string> {
  const origins = new Set<string>()
  try {
    origins.add(new URL(getServerSideURL()).origin)
  } catch {
    // A missing public URL is handled by production environment validation.
  }
  if (process.env.NODE_ENV !== 'production') origins.add(new URL(request.url).origin)
  return origins
}

function ratePolicy(pathname: string): { bucket: string; limit: number } {
  if (/\/uploads\/[^/]+\/parts\/[^/]+$/.test(pathname)) {
    return { bucket: 'upload-targets', limit: 600 }
  }
  if (/\/uploads\/[^/]+\/parts\/[^/]+\/content$/.test(pathname)) {
    return { bucket: 'upload-parts', limit: 600 }
  }
  if (pathname.endsWith('/licence')) return { bucket: 'playback-licences', limit: 120 }
  return { bucket: 'mutations', limit: 30 }
}

export function assertDemoMutationOrigin(request: Request): void {
  if (!MUTATION_METHODS.has(request.method.toUpperCase())) return
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite === 'cross-site' || (origin !== null && !trustedOrigins(request).has(origin))) {
    throw Response.json({ error: 'Cross-origin Demo mutation denied.' }, { status: 403 })
  }
}

export function enforceDemoMutationRateLimit(
  request: Request,
  member: Pick<Member, 'id'>,
  now = Date.now(),
): void {
  if (!MUTATION_METHODS.has(request.method.toUpperCase())) return
  const url = new URL(request.url)
  const policy = ratePolicy(url.pathname)
  const key = `${member.id}:${policy.bucket}`
  const current = rateState.get(key)
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateState.set(key, { count: 1, startedAt: now })
    return
  }
  if (current.count >= policy.limit) {
    const retryAfter = Math.max(1, Math.ceil((current.startedAt + RATE_WINDOW_MS - now) / 1_000))
    throw Response.json(
      { error: 'Too many Demo mutations. Try again shortly.' },
      { headers: { 'retry-after': String(retryAfter) }, status: 429 },
    )
  }
  current.count += 1
}

export function guardDemoActionMutation(headers: Headers, memberID = 0): void {
  const request = new Request(`${getServerSideURL()}/demo`, { headers, method: 'POST' })
  assertDemoMutationOrigin(request)
  enforceDemoMutationRateLimit(request, { id: memberID })
}

export function hardenDemoResponse(response: Response, request: Request): Response {
  if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store')
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.append('vary', 'Origin')
  const origin = request.headers.get('origin')
  if (origin && trustedOrigins(request).has(origin)) {
    response.headers.set('access-control-allow-credentials', 'true')
    response.headers.set('access-control-allow-origin', origin)
  }
  return response
}
