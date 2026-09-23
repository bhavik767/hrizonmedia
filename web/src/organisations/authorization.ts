import 'server-only'

import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import type { Member } from '@/payload-types'
import { recordAuditEvent } from '@/audit/events'

export type OrganisationMediaOperation = 'browse' | 'create' | 'manage' | 'play' | 'read'

export interface OrganisationMediaAuthorization {
  membershipID: number | null
  organisationID: number
  recoveryAccess: boolean
  role: 'administrator' | 'platform-administrator' | 'publisher' | 'viewer'
}

export class OrganisationAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

function relationID(value: number | { id: number } | null | undefined): number | null {
  if (typeof value === 'number') return value
  return value?.id ?? null
}

async function requireActiveMember(payload: Payload, member: Member): Promise<void> {
  const current = await payload.findByID({
    collection: 'members',
    id: member.id,
    overrideAccess: true,
  })
  if (current.status !== 'active') {
    throw new OrganisationAuthorizationError('Active authentication is required.', 401)
  }
}

async function findActivePlatformAdministrator(payload: Payload, memberID: number) {
  const result = await payload.find({
    collection: 'platform-administrators',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { and: [{ member: { equals: memberID } }, { status: { equals: 'active' } }] },
  })
  return result.docs[0] ?? null
}

export async function requirePlatformAdministrator(
  payload: Payload,
  member: Member,
): Promise<void> {
  await requireActiveMember(payload, member)
  if (!(await findActivePlatformAdministrator(payload, member.id))) {
    throw new OrganisationAuthorizationError('Active Platform Administrator access required.', 403)
  }
}

export async function requireOrganisationAdministrator(
  payload: Payload,
  member: Member,
  organisationID: number,
): Promise<OrganisationMediaAuthorization> {
  const authorization = await authorizeOrganisationMedia(payload, member, {
    operation: 'manage',
    organisationID,
  })
  if (authorization.role !== 'administrator' || authorization.membershipID === null) {
    throw new OrganisationAuthorizationError(
      'Active Organisation Administrator access required.',
      403,
    )
  }
  return authorization
}

async function findActiveMembership(payload: Payload, memberID: number, organisationID: number) {
  const result = await payload.find({
    collection: 'organisation-memberships',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        { member: { equals: memberID } },
        { organisation: { equals: organisationID } },
        { status: { equals: 'active' } },
      ],
    },
  })
  return result.docs[0] ?? null
}

export async function authorizeOrganisationMedia(
  payload: Payload,
  member: Member,
  input: { assetID?: number; operation: OrganisationMediaOperation; organisationID?: number },
): Promise<OrganisationMediaAuthorization> {
  await requireActiveMember(payload, member)

  if (Boolean(input.assetID) === Boolean(input.organisationID)) {
    throw new OrganisationAuthorizationError(
      'Specify either an Organisation or a Media Asset for authorization.',
      400,
    )
  }

  const asset = input.assetID
    ? await payload.findByID({
        collection: 'media-assets',
        depth: 0,
        id: input.assetID,
        overrideAccess: true,
      })
    : null
  const organisationID = input.organisationID ?? relationID(asset?.organisation)
  if (!organisationID) {
    throw new OrganisationAuthorizationError('Media Asset is not Organisation-scoped.', 404)
  }

  const organisation = await payload.findByID({
    collection: 'organisations',
    depth: 0,
    id: organisationID,
    overrideAccess: true,
  })
  if (organisation.status !== 'active') {
    throw new OrganisationAuthorizationError('Organisation is not active.', 404)
  }

  const platformAdministrator = await findActivePlatformAdministrator(payload, member.id)
  if (platformAdministrator) {
    await recordAuditEvent(payload, {
      action: 'platform_recovery_accessed',
      actorID: member.id,
      assetID: asset?.id,
      organisationID,
      eventKey: `platform-recovery:${member.id}:${organisationID}:${asset?.id ?? 'organisation'}:${input.operation}:${randomUUID()}`,
      occurredAt: new Date(),
    })
    return {
      membershipID: null,
      organisationID,
      recoveryAccess: true,
      role: 'platform-administrator',
    }
  }

  const membership = await findActiveMembership(payload, member.id, organisationID)
  if (!membership) {
    throw new OrganisationAuthorizationError('Active Organisation Membership required.', 403)
  }

  const role = membership.role
  const ownsAsset = relationID(asset?.owner) === member.id
  const canManage = role === 'administrator' || (role === 'publisher' && ownsAsset)
  if (input.operation === 'browse') {
    return { membershipID: membership.id, organisationID, recoveryAccess: false, role }
  }
  if (input.operation === 'create' && (role === 'administrator' || role === 'publisher')) {
    return { membershipID: membership.id, organisationID, recoveryAccess: false, role }
  }
  if (input.operation === 'manage' && canManage) {
    return { membershipID: membership.id, organisationID, recoveryAccess: false, role }
  }
  if ((input.operation === 'read' || input.operation === 'play') && canManage) {
    return { membershipID: membership.id, organisationID, recoveryAccess: false, role }
  }

  if (asset && asset.status === 'ready' && role === 'viewer') {
    const access = await payload.find({
      collection: 'media-access',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [
          { asset: { equals: asset.id } },
          { membership: { equals: membership.id } },
          { status: { equals: 'active' } },
        ],
      },
    })
    if (access.docs[0] && (input.operation === 'read' || input.operation === 'play')) {
      return { membershipID: membership.id, organisationID, recoveryAccess: false, role }
    }
  }

  throw new OrganisationAuthorizationError('Organisation media access denied.', 403)
}
