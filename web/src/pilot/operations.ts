import 'server-only'

import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import type { PilotMember } from '@/payload-types'
import { recordAuditEvent } from '@/audit/events'

export class OperatorAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export interface OperationalControls {
  killSwitchEnabled: boolean
  providerConcurrency: number
}

const CONTROL_KEY = 'global'

function defaultProviderConcurrency(): number {
  const configured = Number(process.env.MEDIA_PROVIDER_CONCURRENCY ?? 2)
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= 100 ? configured : 2
}

export async function getOperationalControls(payload: Payload): Promise<OperationalControls> {
  const result = await payload.find({
    collection: 'media-operations',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { key: { equals: CONTROL_KEY } },
  })
  const controls = result.docs[0]
  return controls
    ? {
        killSwitchEnabled: controls.killSwitchEnabled,
        providerConcurrency: controls.providerConcurrency,
      }
    : { killSwitchEnabled: false, providerConcurrency: defaultProviderConcurrency() }
}

export async function assertMediaActivityAllowed(payload: Payload): Promise<void> {
  if ((await getOperationalControls(payload)).killSwitchEnabled) {
    throw new OperatorAuthorizationError(
      'Media activity is temporarily paused by an operator.',
      503,
    )
  }
}

async function requireActiveOperator(
  payload: Payload,
  member: PilotMember,
): Promise<PilotMember> {
  const current = await payload.findByID({
    collection: 'pilot-members',
    id: member.id,
    overrideAccess: true,
  })
  if (current.status !== 'active' || current.role !== 'operator') {
    throw new OperatorAuthorizationError('Active operator access required.', 403)
  }
  return current
}

export async function getOperatorOverview(payload: Payload, member: PilotMember) {
  await requireActiveOperator(payload, member)
  const [members, assets, auditEvents, controls] = await Promise.all([
    payload.find({
      collection: 'pilot-members',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      sort: 'email',
    }),
    payload.find({
      collection: 'media-assets',
      depth: 1,
      overrideAccess: true,
      pagination: false,
      sort: '-createdAt',
    }),
    payload.find({
      collection: 'audit-events',
      depth: 1,
      limit: 100,
      overrideAccess: true,
      sort: '-occurredAt',
    }),
    getOperationalControls(payload),
  ])

  return {
    auditEvents: auditEvents.docs.map((event) => ({
      action: event.action,
      actorEmail: typeof event.actor === 'number' ? null : event.actor?.email ?? null,
      assetId: typeof event.asset === 'number' ? null : event.asset?.mediaAssetId ?? null,
      details: event.details,
      eventKey: event.eventKey,
      memberEmail: typeof event.member === 'number' ? null : event.member?.email ?? null,
      occurredAt: event.occurredAt,
    })),
    assets: assets.docs.map((asset) => ({
      fileName: asset.fileName,
      mediaAssetId: asset.mediaAssetId,
      ownerEmail: typeof asset.owner === 'number' ? 'Unknown member' : asset.owner.email,
      size: asset.size,
      status: asset.status,
    })),
    controls,
    members: members.docs.map((pilotMember) => ({
      email: pilotMember.email,
      id: pilotMember.id,
      name: pilotMember.name,
      role: pilotMember.role,
      status: pilotMember.status,
    })),
  }
}

export async function updateOperationalControls(
  payload: Payload,
  operator: PilotMember,
  controls: OperationalControls,
  options: { now?: Date } = {},
): Promise<OperationalControls> {
  const actor = await requireActiveOperator(payload, operator)
  if (
    typeof controls.killSwitchEnabled !== 'boolean' ||
    !Number.isSafeInteger(controls.providerConcurrency) ||
    controls.providerConcurrency < 1 ||
    controls.providerConcurrency > 100
  ) {
    throw new OperatorAuthorizationError('Provider concurrency must be between 1 and 100.', 400)
  }
  const existing = await payload.find({
    collection: 'media-operations',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { key: { equals: CONTROL_KEY } },
  })
  const data = {
    killSwitchEnabled: controls.killSwitchEnabled,
    providerConcurrency: controls.providerConcurrency,
    updatedBy: actor.id,
  }
  if (existing.docs[0]) {
    await payload.update({
      collection: 'media-operations',
      data,
      id: existing.docs[0].id,
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'media-operations',
      data: { ...data, key: CONTROL_KEY },
      overrideAccess: true,
    })
  }
  const now = options.now ?? new Date()
  await recordAuditEvent(payload, {
    action: 'operations_controls_updated',
    actorID: actor.id,
    details: { ...controls },
    eventKey: `media-operations:${actor.id}:${now.toISOString()}:${randomUUID()}`,
    occurredAt: now,
  })
  return controls
}

export async function disablePilotMember(
  payload: Payload,
  operator: PilotMember,
  memberID: number,
  options: { now?: Date } = {},
): Promise<void> {
  const actor = await requireActiveOperator(payload, operator)
  if (memberID === actor.id) {
    throw new OperatorAuthorizationError('Operators cannot disable their own account.', 409)
  }
  const target = await payload.findByID({
    collection: 'pilot-members',
    id: memberID,
    overrideAccess: true,
  })
  const now = options.now ?? new Date()
  if (target.status !== 'disabled') {
    await payload.update({
      collection: 'pilot-members',
      data: { status: 'disabled' },
      id: target.id,
      overrideAccess: true,
    })
  }
  await recordAuditEvent(payload, {
    action: 'member_disabled',
    actorID: actor.id,
    eventKey: `pilot-member:${target.id}:disabled`,
    memberID: target.id,
    occurredAt: now,
  })
}
