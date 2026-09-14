import 'server-only'

import type { Payload } from 'payload'

import type { MediaAsset, PilotMember } from '@/payload-types'

import type { MediaAssetId, ProviderJobId, ProviderUploadId } from './identifiers'
import { MediaLibraryError } from './library'
import { getFakeProviders } from './providers/fake'
import type { MediaProviders } from './providers/contracts'

const DAY_MS = 24 * 60 * 60 * 1000

type LifecycleAction =
  'access_revoked' | 'asset_deleted' | 'asset_expired' | 'outputs_deleted' | 'source_deleted'

function relationID(value: number | { id: number }): number {
  return typeof value === 'number' ? value : value.id
}

async function recordLifecycleEvent(
  payload: Payload,
  assetID: number,
  action: LifecycleAction,
  now: Date,
  actorID?: number,
): Promise<void> {
  const eventKey = `media-asset:${assetID}:${action}`
  const existing = await payload.find({
    collection: 'audit-events',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { eventKey: { equals: eventKey } },
  })
  if (existing.docs.length > 0) return
  try {
    await payload.create({
      collection: 'audit-events',
      data: {
        action,
        actor: actorID,
        asset: assetID,
        eventKey,
        occurredAt: now.toISOString(),
      },
      overrideAccess: true,
    })
  } catch (error) {
    const concurrent = await payload.find({
      collection: 'audit-events',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { eventKey: { equals: eventKey } },
    })
    if (concurrent.docs.length === 0) throw error
  }
}

async function reconcileLifecycleEvents(payload: Payload, assetID?: number): Promise<void> {
  const assets = await payload.find({
    collection: 'media-assets',
    depth: 0,
    overrideAccess: true,
    pagination: false,
    where: assetID ? { id: { equals: assetID } } : {},
  })
  for (const asset of assets.docs) {
    const events: Array<{ action: LifecycleAction; actorID?: number; occurredAt: string }> = []
    if (asset.status === 'deleted' && asset.deletedAt) {
      events.push({
        action: 'asset_deleted',
        actorID: asset.deletedBy ? relationID(asset.deletedBy) : undefined,
        occurredAt: asset.deletedAt,
      })
    }
    if (asset.status === 'expired') {
      events.push({
        action: 'asset_expired',
        occurredAt: asset.statusChangedAt,
      })
    }
    if (asset.accessRevokedAt) {
      events.push({ action: 'access_revoked', occurredAt: asset.accessRevokedAt })
    }
    if (asset.sourceDeletedAt) {
      events.push({ action: 'source_deleted', occurredAt: asset.sourceDeletedAt })
    }
    if (asset.outputsDeletedAt) {
      events.push({ action: 'outputs_deleted', occurredAt: asset.outputsDeletedAt })
    }
    for (const event of events) {
      try {
        await recordLifecycleEvent(
          payload,
          asset.id,
          event.action,
          new Date(event.occurredAt),
          event.actorID,
        )
      } catch (error) {
        console.error('Media Asset audit event will be reconciled.', error)
      }
    }
  }
}

function canManageAsset(member: PilotMember, asset: MediaAsset): boolean {
  const ownerID = typeof asset.owner === 'number' ? asset.owner : asset.owner.id
  return member.status === 'active' && (member.role === 'operator' || ownerID === member.id)
}

async function manageableAsset(
  payload: Payload,
  member: PilotMember,
  mediaAssetId: MediaAssetId,
): Promise<MediaAsset> {
  const result = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { mediaAssetId: { equals: mediaAssetId } },
  })
  const asset = result.docs[0]
  if (!asset || !canManageAsset(member, asset)) {
    throw new MediaLibraryError('Media Asset not found.', 404)
  }
  return asset
}

export async function deleteMediaAsset(
  payload: Payload,
  member: PilotMember,
  mediaAssetId: MediaAssetId,
  options: { now?: Date; providers?: MediaProviders } = {},
): Promise<void> {
  const asset = await manageableAsset(payload, member, mediaAssetId)
  const now = options.now ?? new Date()
  const deletedAsset =
    asset.status === 'deleted'
      ? asset
      : await payload.update({
          collection: 'media-assets',
          data: {
            deletedAt: now.toISOString(),
            deletedBy: member.id,
            status: 'deleted',
            statusChangedAt: now.toISOString(),
          },
          id: asset.id,
          overrideAccess: true,
        })
  try {
    await cleanupRevokedAsset(payload, deletedAsset, now, options.providers ?? getFakeProviders())
  } catch (error) {
    console.error('Media Asset provider cleanup will be retried.', error)
  }
  await reconcileLifecycleEvents(payload, asset.id)
}

async function cleanupRevokedAsset(
  payload: Payload,
  asset: MediaAsset,
  now: Date,
  providers: MediaProviders,
): Promise<void> {
  let firstError: unknown
  if (!asset.sourceDeletedAt) {
    try {
      await deleteRawSource(payload, asset, now, providers)
    } catch (error) {
      firstError = error
    }
  }
  if (!asset.accessRevokedAt) {
    try {
      await providers.delivery.revokeAsset(asset.mediaAssetId as MediaAssetId)
      await payload.update({
        collection: 'media-assets',
        data: { accessRevokedAt: now.toISOString() },
        id: asset.id,
        overrideAccess: true,
      })
    } catch (error) {
      firstError ??= error
    }
  }
  if (!asset.outputsDeletedAt) {
    try {
      const jobs = await payload.find({
        collection: 'processing-jobs',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: { asset: { equals: asset.id } },
      })
      const job = jobs.docs[0]
      await providers.transcode.deleteOutputs({
        mediaAssetId: asset.mediaAssetId as MediaAssetId,
        providerJobId: (job?.providerJobId as ProviderJobId | null) ?? null,
      })
      await payload.update({
        collection: 'media-assets',
        data: { outputsDeletedAt: now.toISOString() },
        id: asset.id,
        overrideAccess: true,
      })
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError) throw firstError
}

async function deleteRawSource(
  payload: Payload,
  asset: MediaAsset,
  now: Date,
  providers: MediaProviders,
): Promise<void> {
  const sessions = await payload.find({
    collection: 'upload-sessions',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { asset: { equals: asset.id } },
  })
  const session = sessions.docs[0]
  if (session?.objectKey) {
    await providers.storage.deleteObject(session.objectKey)
    await payload.update({
      collection: 'upload-sessions',
      data: { objectKey: null },
      id: session.id,
      overrideAccess: true,
    })
  } else if (session?.status === 'pending') {
    await providers.storage.abortMultipart(session.providerUploadId as ProviderUploadId)
    await payload.update({
      collection: 'upload-sessions',
      data: { status: 'aborted' },
      id: session.id,
      overrideAccess: true,
    })
  }
  await payload.update({
    collection: 'media-assets',
    data: { sourceDeletedAt: now.toISOString() },
    id: asset.id,
    overrideAccess: true,
  })
}

export async function runMediaLifecycle(
  payload: Payload,
  options: { now?: Date; providers?: MediaProviders } = {},
): Promise<void> {
  const now = options.now ?? new Date()
  const providers = options.providers ?? getFakeProviders()
  const [successfulJobs, failedJobs] = await Promise.all([
    payload.find({
      collection: 'processing-jobs',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { status: { equals: 'ready' } },
          { readyAt: { less_than_equal: new Date(now.getTime() - DAY_MS).toISOString() } },
        ],
      },
    }),
    payload.find({
      collection: 'processing-jobs',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { status: { equals: 'failed' } },
          { failedAt: { less_than_equal: new Date(now.getTime() - 2 * DAY_MS).toISOString() } },
        ],
      },
    }),
  ])

  for (const job of [...successfulJobs.docs, ...failedJobs.docs]) {
    const asset = await payload.findByID({
      collection: 'media-assets',
      depth: 0,
      id: relationID(job.asset),
      overrideAccess: true,
    })
    if (asset.sourceDeletedAt) continue
    try {
      await deleteRawSource(payload, asset, now, providers)
    } catch (error) {
      console.error('Media Asset source cleanup will be retried.', error)
    }
  }

  const expiring = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: {
      and: [{ status: { equals: 'ready' } }, { expiresAt: { less_than_equal: now.toISOString() } }],
    },
  })
  for (const asset of expiring.docs) {
    await payload.update({
      collection: 'media-assets',
      data: { status: 'expired', statusChangedAt: now.toISOString() },
      id: asset.id,
      overrideAccess: true,
    })
  }

  const cleanupPending = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: {
      and: [
        { status: { in: ['expired', 'deleted'] } },
        {
          or: [
            { accessRevokedAt: { exists: false } },
            { sourceDeletedAt: { exists: false } },
            { outputsDeletedAt: { exists: false } },
          ],
        },
      ],
    },
  })
  for (const asset of cleanupPending.docs) {
    try {
      await cleanupRevokedAsset(payload, asset, now, providers)
    } catch (error) {
      console.error('Media Asset provider cleanup will be retried.', error)
    }
  }
  await reconcileLifecycleEvents(payload)
}
