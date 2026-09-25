import 'server-only'

import type { Payload } from 'payload'

import { recordAuditEvent } from '@/audit/events'
import {
  authorizeOrganisationMedia,
  OrganisationAuthorizationError,
} from '@/organisations/authorization'
import type { MediaAccess, MediaAsset, OrganisationMembership, Member } from '@/payload-types'

export class OrganisationMediaAccessError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

type MediaAccessInput = {
  actor: Member
  assetID: number
  membershipID: number
  now?: Date
  payload: Payload
}

function relationID(value: number | { id: number } | null | undefined): number | null {
  if (typeof value === 'number') return value
  return value?.id ?? null
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new OrganisationMediaAccessError(`A valid ${name} is required.`, 400)
  }
}

async function findAsset(payload: Payload, assetID: number): Promise<MediaAsset> {
  requirePositiveInteger(assetID, 'Media Asset')
  try {
    return await payload.findByID({
      collection: 'media-assets',
      depth: 0,
      id: assetID,
      overrideAccess: true,
    })
  } catch {
    throw new OrganisationMediaAccessError('Media Asset not found.', 404)
  }
}

async function findViewerMembership(
  payload: Payload,
  membershipID: number,
  organisationID: number,
): Promise<OrganisationMembership> {
  requirePositiveInteger(membershipID, 'Organisation Membership')
  try {
    const membership = await payload.findByID({
      collection: 'organisation-memberships',
      depth: 0,
      id: membershipID,
      overrideAccess: true,
    })
    if (relationID(membership.organisation) !== organisationID) {
      throw new OrganisationMediaAccessError('Organisation Membership not found.', 404)
    }
    if (membership.status !== 'active' || membership.role !== 'viewer') {
      throw new OrganisationMediaAccessError(
        'Media Access can be granted only to an active Organisation Viewer.',
        409,
      )
    }
    return membership
  } catch (error) {
    if (error instanceof OrganisationMediaAccessError) throw error
    throw new OrganisationMediaAccessError('Organisation Membership not found.', 404)
  }
}

async function managedAsset(
  payload: Payload,
  actor: Member,
  assetID: number,
): Promise<{
  asset: MediaAsset
  organisationID: number
}> {
  const asset = await findAsset(payload, assetID)
  const organisationID = relationID(asset.organisation)
  if (!organisationID) {
    throw new OrganisationMediaAccessError('Media Asset is not Organisation-scoped.', 409)
  }
  try {
    const authorization = await authorizeOrganisationMedia(payload, actor, {
      assetID: asset.id,
      operation: 'manage',
    })
    if (authorization.role === 'platform-administrator') {
      throw new OrganisationMediaAccessError(
        'Organisation Administrators and owning Organisation Publishers manage Media Access.',
        403,
      )
    }
  } catch (error) {
    if (
      error instanceof OrganisationAuthorizationError ||
      error instanceof OrganisationMediaAccessError
    ) {
      throw new OrganisationMediaAccessError(error.message, error.status)
    }
    throw error
  }
  return { asset, organisationID }
}

async function findMediaAccess(
  payload: Payload,
  assetID: number,
  membershipID: number,
): Promise<MediaAccess | undefined> {
  const result = await payload.find({
    collection: 'media-access',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [{ asset: { equals: assetID } }, { membership: { equals: membershipID } }],
    },
  })
  return result.docs[0]
}

export async function grantMediaAccess(input: MediaAccessInput): Promise<MediaAccess> {
  const { asset, organisationID } = await managedAsset(input.payload, input.actor, input.assetID)
  if (asset.status !== 'ready') {
    throw new OrganisationMediaAccessError(
      'Media Access can be granted only for a ready Media Asset.',
      409,
    )
  }
  const membership = await findViewerMembership(input.payload, input.membershipID, organisationID)
  const existing = await findMediaAccess(input.payload, asset.id, membership.id)
  const access = existing
    ? await input.payload.update({
        collection: 'media-access',
        data: { status: 'active' },
        id: existing.id,
        overrideAccess: true,
      })
    : await input.payload.create({
        collection: 'media-access',
        data: { asset: asset.id, membership: membership.id, status: 'active' },
        overrideAccess: true,
      })
  await recordAuditEvent(input.payload, {
    action: 'media_access_granted',
    actorID: input.actor.id,
    assetID: asset.id,
    details: { membershipID: membership.id },
    eventKey: `media-access:${asset.id}:${membership.id}:granted:${(input.now ?? new Date()).toISOString()}`,
    organisationID,
    occurredAt: input.now ?? new Date(),
  })
  return access
}

export async function revokeMediaAccess(input: MediaAccessInput): Promise<void> {
  const { asset, organisationID } = await managedAsset(input.payload, input.actor, input.assetID)
  const membership = await findViewerMembership(input.payload, input.membershipID, organisationID)
  const access = await findMediaAccess(input.payload, asset.id, membership.id)
  if (!access || access.status === 'revoked') return

  const memberID = relationID(membership.member)
  if (!memberID) throw new Error('Organisation Membership is incomplete.')
  await input.payload.update({
    collection: 'media-access',
    data: { status: 'revoked' },
    id: access.id,
    overrideAccess: true,
  })
  await input.payload.delete({
    collection: 'playback-grants',
    overrideAccess: true,
    where: {
      and: [{ asset: { equals: asset.id } }, { owner: { equals: memberID } }],
    },
  })
  const now = input.now ?? new Date()
  await recordAuditEvent(input.payload, {
    action: 'media_access_revoked',
    actorID: input.actor.id,
    assetID: asset.id,
    details: { membershipID: membership.id },
    eventKey: `media-access:${asset.id}:${membership.id}:revoked:${now.toISOString()}`,
    organisationID,
    occurredAt: now,
  })
}

export async function listMediaAccessViewers(
  payload: Payload,
  actor: Member,
  assetID: number,
): Promise<Array<{ access: 'active' | 'revoked' | 'none'; membershipID: number; name: string }>> {
  const { organisationID } = await managedAsset(payload, actor, assetID)
  const memberships = await payload.find({
    collection: 'organisation-memberships',
    depth: 1,
    limit: 100,
    overrideAccess: true,
    sort: 'id',
    where: {
      and: [
        { organisation: { equals: organisationID } },
        { role: { equals: 'viewer' } },
        { status: { equals: 'active' } },
      ],
    },
  })
  const accessRecords = await payload.find({
    collection: 'media-access',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: { asset: { equals: assetID } },
  })
  const statusByMembership = new Map(
    accessRecords.docs.map((access) => [relationID(access.membership), access.status]),
  )
  return memberships.docs.map((membership) => ({
    access: statusByMembership.get(membership.id) ?? 'none',
    membershipID: membership.id,
    name:
      typeof membership.member === 'object' && membership.member !== null
        ? membership.member.name
        : `Viewer #${membership.id}`,
  }))
}
