import { notFound } from 'next/navigation'
import { connection } from 'next/server'

export async function ensureDemoEnabled(): Promise<void> {
  await connection()
  if (process.env.HRIZONMEDIA_DEMO_ENABLED !== 'true') notFound()
}
