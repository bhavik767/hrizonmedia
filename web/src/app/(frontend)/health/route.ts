import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { logMediaDiagnostic } from '@/media/diagnostics'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payload = await getPayload({ config })
    await payload.db.drizzle.execute(sql`SELECT 1`)
    return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    logMediaDiagnostic('error', 'health_unavailable')
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
