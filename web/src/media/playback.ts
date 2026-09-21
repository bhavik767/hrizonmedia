import 'server-only'

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import type { MediaAsset, PilotMember, PlaybackGrant } from '@/payload-types'
import { recordAuditEvent } from '@/audit/events'
import { assertMediaActivityAllowed } from '@/pilot/operations'
import {
  isProtectedPlaybackBrowser,
  type ProtectedPlaybackBrowser,
  widevinePlaybackBrowser,
} from './playback-browser'

import {
  newLeakId,
  newPlaybackGrantId,
  type DeliveryToken,
  type LeakId,
  type MediaAssetId,
  type PlaybackGrantId,
  type PlaybackGrantToken,
  type ProcessingJobId,
} from './identifiers'
import type {
  DeliveryAuthorization,
  DrmPlaybackContract,
  MediaProviders,
} from './providers/contracts'
import { getMediaProviders } from './providers'

const GRANT_LIFETIME_MS = 5 * 60 * 1000
const MAX_ASSET_DURATION_MS = 2 * 60 * 60 * 1000
const DELIVERY_LIFETIME_MS = MAX_ASSET_DURATION_MS + GRANT_LIFETIME_MS
const WATERMARK_ROTATION_INTERVAL_MS = 30 * 1000

type PlaybackTokenKind = 'delivery' | 'grant'

interface PlaybackTokenClaims {
  asset: MediaAssetId
  browser: ProtectedPlaybackBrowser
  exp: number
  grant: PlaybackGrantId
  kind: PlaybackTokenKind
  owner: number
}

export type PlaybackGrantResponse = DrmPlaybackContract & {
  deliveryExpiresAt: string
  deliveryToken: DeliveryToken
  expiresAt: string
  manifestURL: string
  playbackGrantId: PlaybackGrantId
  playbackGrantToken: PlaybackGrantToken
  resourceAuthorization?: DeliveryAuthorization['resourceAuthorization']
  watermark: PlaybackWatermark
}

export interface PlaybackWatermark {
  issuedAt: string
  leakId: LeakId
}

export class PlaybackAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

function relationID(value: number | { id: number }): number {
  return typeof value === 'number' ? value : value.id
}

function signingSecret(): string {
  const secret = process.env.PAYLOAD_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'test') return 'hrizonmedia-test-playback-secret'
  throw new Error('PAYLOAD_SECRET is required for playback authorization.')
}

function encodeClaims(claims: PlaybackTokenClaims): DeliveryToken | PlaybackGrantToken {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = createHmac('sha256', signingSecret()).update(payload).digest('base64url')
  return `${payload}.${signature}` as DeliveryToken | PlaybackGrantToken
}

function decodeClaims(
  token: DeliveryToken | PlaybackGrantToken,
  kind: PlaybackTokenKind,
  now: Date,
): PlaybackTokenClaims {
  const fields = token.split('.')
  const [payload, suppliedSignature] = fields
  if (fields.length !== 2 || !payload || !suppliedSignature || token.length > 2048) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
  }
  const expectedSignature = createHmac('sha256', signingSecret()).update(payload).digest()
  let receivedSignature: Buffer
  try {
    receivedSignature = Buffer.from(suppliedSignature, 'base64url')
  } catch {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
  }
  if (
    receivedSignature.toString('base64url') !== suppliedSignature ||
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
  }

  let claims: PlaybackTokenClaims
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
  }
  if (
    claims.kind !== kind ||
    !isProtectedPlaybackBrowser(claims.browser) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp < now.getTime()
  ) {
    throw new PlaybackAuthorizationError('Playback authorization has expired.', 401)
  }
  return claims
}

async function activeUploader(payload: Payload, member: PilotMember): Promise<PilotMember> {
  const current = await payload.findByID({
    collection: 'pilot-members',
    id: member.id,
    overrideAccess: true,
  })
  if (current.status !== 'active' || current.role !== 'uploader') {
    throw new PlaybackAuthorizationError('Uploader authentication required.', 401)
  }
  return current
}

async function ownedAsset(
  payload: Payload,
  owner: PilotMember,
  mediaAssetId: MediaAssetId,
): Promise<MediaAsset> {
  const result = await payload.find({
    collection: 'media-assets',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [{ mediaAssetId: { equals: mediaAssetId } }, { owner: { equals: owner.id } }],
    },
  })
  const asset = result.docs[0]
  if (!asset || asset.status === 'deleted') {
    throw new PlaybackAuthorizationError('Media Asset not found.', 404)
  }
  return asset
}

function assertPlayable(asset: MediaAsset, now: Date): void {
  if (asset.status !== 'ready') {
    throw new PlaybackAuthorizationError('Media Asset is not ready for playback.', 409)
  }
  if (!asset.drmContentId) {
    throw new PlaybackAuthorizationError('Media Asset is not encrypted for playback.', 409)
  }
  if (!asset.expiresAt || new Date(asset.expiresAt).getTime() <= now.getTime()) {
    throw new PlaybackAuthorizationError('Media Asset has expired.', 410)
  }
}

async function storedGrant(payload: Payload, claims: PlaybackTokenClaims): Promise<PlaybackGrant> {
  const result = await payload.find({
    collection: 'playback-grants',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { playbackGrantId: { equals: claims.grant } },
  })
  const grant = result.docs[0]
  if (!grant || relationID(grant.asset) <= 0 || relationID(grant.owner) !== claims.owner) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 401)
  }
  return grant
}

async function assetProcessingJobId(
  payload: Payload,
  assetID: number,
): Promise<ProcessingJobId | undefined> {
  const jobs = await payload.find({
    collection: 'processing-jobs',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { asset: { equals: assetID } },
  })
  const processingJobId = jobs.docs[0]?.processingJobId
  return processingJobId ? (processingJobId as ProcessingJobId) : undefined
}

function newPlaybackWatermark(now: Date): PlaybackWatermark {
  return { issuedAt: now.toISOString(), leakId: newLeakId() }
}

function storedPlaybackWatermark(grant: PlaybackGrant): PlaybackWatermark {
  return {
    issuedAt: grant.leakIdIssuedAt,
    leakId: grant.leakId as LeakId,
  }
}

async function recordLeakIdIssued(
  payload: Payload,
  input: {
    assetID: number
    ownerID: number
    playbackGrantId: PlaybackGrantId
    watermark: PlaybackWatermark
  },
): Promise<void> {
  await recordAuditEvent(payload, {
    action: 'playback_leak_id_issued',
    actorID: input.ownerID,
    assetID: input.assetID,
    details: { leakId: input.watermark.leakId, playbackGrantId: input.playbackGrantId },
    eventKey: `playback-grant:${input.playbackGrantId}:leak:${input.watermark.leakId}`,
    occurredAt: new Date(input.watermark.issuedAt),
  })
}

export async function createPlaybackGrant(
  payload: Payload,
  member: PilotMember,
  mediaAssetId: MediaAssetId,
  options: { browser?: ProtectedPlaybackBrowser; now?: Date; providers?: MediaProviders } = {},
): Promise<PlaybackGrantResponse> {
  await assertMediaActivityAllowed(payload)
  const now = options.now ?? new Date()
  const providers = options.providers ?? getMediaProviders()
  const browser = options.browser ?? widevinePlaybackBrowser
  const owner = await activeUploader(payload, member)
  const asset = await ownedAsset(payload, owner, mediaAssetId)
  assertPlayable(asset, now)

  const playbackGrantId = newPlaybackGrantId()
  const expiresAt = new Date(now.getTime() + GRANT_LIFETIME_MS)
  const deliveryExpiresAt = new Date(now.getTime() + DELIVERY_LIFETIME_MS)
  const watermark = newPlaybackWatermark(now)
  await payload.create({
    collection: 'playback-grants',
    data: {
      asset: asset.id,
      deliveryExpiresAt: deliveryExpiresAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      leakId: watermark.leakId,
      leakIdIssuedAt: watermark.issuedAt,
      owner: owner.id,
      playbackGrantId,
    },
    overrideAccess: true,
  })
  const playbackGrantToken = encodeClaims({
    asset: mediaAssetId,
    browser,
    exp: expiresAt.getTime(),
    grant: playbackGrantId,
    kind: 'grant',
    owner: owner.id,
  }) as PlaybackGrantToken
  const deliveryToken = encodeClaims({
    asset: mediaAssetId,
    browser,
    exp: deliveryExpiresAt.getTime(),
    grant: playbackGrantId,
    kind: 'delivery',
    owner: owner.id,
  }) as DeliveryToken
  const processingJobId = await assetProcessingJobId(payload, asset.id)
  const [delivery, drm] = await Promise.all([
    providers.delivery.authorize({
      expiresAt: deliveryExpiresAt,
      mediaAssetId,
      manifestFormat: browser.manifestFormat,
      playbackGrantId,
      processingJobId,
      token: deliveryToken,
    }),
    providers.drm.createPlaybackContract({ browser, playbackGrantId }),
  ])
  await recordAuditEvent(payload, {
    action: 'playback_granted',
    actorID: owner.id,
    assetID: asset.id,
    eventKey: `playback-grant:${playbackGrantId}:granted`,
    occurredAt: now,
  })
  await recordLeakIdIssued(payload, {
    assetID: asset.id,
    ownerID: owner.id,
    playbackGrantId,
    watermark,
  })
  return {
    ...drm,
    deliveryExpiresAt: delivery.expiresAt,
    deliveryToken,
    expiresAt: expiresAt.toISOString(),
    manifestURL: delivery.manifestURL,
    playbackGrantId,
    playbackGrantToken,
    resourceAuthorization: delivery.resourceAuthorization,
    watermark,
  }
}

export async function refreshPlaybackWatermark(
  payload: Payload,
  member: PilotMember,
  token: PlaybackGrantToken,
  options: { now?: Date; requestedPlaybackGrantId?: PlaybackGrantId } = {},
): Promise<PlaybackWatermark> {
  await assertMediaActivityAllowed(payload)
  const now = options.now ?? new Date()
  const owner = await activeUploader(payload, member)
  const claims = decodeClaims(token, 'grant', now)
  if (options.requestedPlaybackGrantId && claims.grant !== options.requestedPlaybackGrantId) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 403)
  }
  if (claims.owner !== owner.id) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 403)
  }
  const grant = await storedGrant(payload, claims)
  const asset = await ownedAsset(payload, owner, claims.asset)
  assertPlayable(asset, now)
  const current = storedPlaybackWatermark(grant)
  if (now.getTime() - new Date(current.issuedAt).getTime() < WATERMARK_ROTATION_INTERVAL_MS) {
    return current
  }

  const watermark = newPlaybackWatermark(now)
  await payload.update({
    collection: 'playback-grants',
    data: { leakId: watermark.leakId, leakIdIssuedAt: watermark.issuedAt },
    id: grant.id,
    overrideAccess: true,
  })
  await recordLeakIdIssued(payload, {
    assetID: asset.id,
    ownerID: owner.id,
    playbackGrantId: claims.grant,
    watermark,
  })
  return watermark
}

export async function acquirePlaybackLicence(
  payload: Payload,
  member: PilotMember,
  token: PlaybackGrantToken,
  options: {
    challenge?: Uint8Array
    now?: Date
    providers?: MediaProviders
    requestedPlaybackGrantId?: PlaybackGrantId
  } = {},
) {
  await assertMediaActivityAllowed(payload)
  const now = options.now ?? new Date()
  const providers = options.providers ?? getMediaProviders()
  const owner = await activeUploader(payload, member)
  const claims = decodeClaims(token, 'grant', now)
  if (options.requestedPlaybackGrantId && claims.grant !== options.requestedPlaybackGrantId) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 403)
  }
  if (claims.owner !== owner.id) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 403)
  }
  await storedGrant(payload, claims)
  const asset = await ownedAsset(payload, owner, claims.asset)
  assertPlayable(asset, now)
  const contract = providers.drm.createPlaybackContract({
    browser: claims.browser,
    playbackGrantId: claims.grant,
  })
  const licence = await providers.drm.acquireTemporaryLicence({
    browser: claims.browser,
    challenge: options.challenge ?? new Uint8Array(),
    drmContentId: asset.drmContentId!,
    playbackGrantId: claims.grant,
  })
  await recordAuditEvent(payload, {
    action: 'playback_licence_acquired',
    actorID: owner.id,
    assetID: asset.id,
    eventKey: `playback-grant:${claims.grant}:licence:${now.toISOString()}:${randomUUID()}`,
    occurredAt: now,
  })
  return { ...contract, licence, playbackGrantId: claims.grant }
}

export async function authorizePlaybackResource(
  payload: Payload,
  member: PilotMember,
  token: DeliveryToken,
  requestedAssetId: MediaAssetId,
  options: { now?: Date } = {},
) {
  await assertMediaActivityAllowed(payload)
  const now = options.now ?? new Date()
  const owner = await activeUploader(payload, member)
  const claims = decodeClaims(token, 'delivery', now)
  if (claims.owner !== owner.id) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 403)
  }
  if (claims.asset !== requestedAssetId) {
    throw new PlaybackAuthorizationError('Playback authorization is scoped to another asset.', 403)
  }
  const grant = await storedGrant(payload, claims)
  const asset = await payload.findByID({
    collection: 'media-assets',
    id: relationID(grant.asset),
    overrideAccess: true,
  })
  if (asset.mediaAssetId !== claims.asset) {
    throw new PlaybackAuthorizationError('Playback authorization is invalid.', 403)
  }
  assertPlayable(asset, now)
  return {
    deliveryExpiresAt: grant.deliveryExpiresAt,
    mediaAssetId: claims.asset,
    manifestFormat: claims.browser.manifestFormat,
    playbackGrantId: claims.grant,
    processingJobId: await assetProcessingJobId(payload, asset.id),
  }
}
