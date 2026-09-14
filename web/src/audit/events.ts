import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import type { AuditAction } from './actions'

export async function recordAuditEvent(
  payload: Payload,
  input: {
    action: AuditAction
    actorID?: number
    assetID?: number
    details?: Record<string, unknown>
    eventKey: string
    memberID?: number
    occurredAt: Date
    req?: PayloadRequest
  },
): Promise<void> {
  try {
    await payload.create({
      collection: 'audit-events',
      data: {
        action: input.action,
        actor: input.actorID,
        asset: input.assetID,
        details: input.details,
        eventKey: input.eventKey,
        member: input.memberID,
        occurredAt: input.occurredAt.toISOString(),
      },
      overrideAccess: true,
      req: input.req,
    })
  } catch (error) {
    const existing = await payload.find({
      collection: 'audit-events',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req: input.req,
      where: { eventKey: { equals: input.eventKey } },
    })
    if (existing.docs.length === 0) throw error
  }
}
