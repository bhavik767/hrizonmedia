import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import type { MediaAsset, PilotMember, PlaybackGrant } from '@/payload-types'

import {
  newPlaybackGrantId,
  type DeliveryToken,
  type MediaAssetId,
  type PlaybackGrantId,
  type PlaybackGrantToken,
} from './identifiers'
import type { DrmPlaybackContract, MediaProviders } from './providers/contracts'
import { getFakeProviders } from './providers/fake'

const GRANT_LIFETIME_MS = 5 * 60 * 1000
const MAX_ASSET_DURATION_MS = 2 * 60 * 60 * 1000
const DELIVERY_LIFETIME_MS = MAX_ASSET_DURATION_MS + GRANT_LIFETIME_MS

type PlaybackTokenKind = 'delivery' | 'grant'

interface PlaybackTokenClaims {
  asset: MediaAssetId
  exp: number
  grant: PlaybackGrantId
  kind: PlaybackTokenKind
  owner: number
}

export interface PlaybackGrantResponse extends DrmPlaybackContract {
  deliveryExpiresAt: string
  deliveryToken: DeliveryToken
  expiresAt: string
  manifestURL: string
  playbackGrantId: PlaybackGrantId
  playbackGrantToken: PlaybackGrantToken
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
  const [payload, suppliedSignature] = token.split('.')
  if (!payload || !suppliedSignature) {
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
  if (claims.kind !== kind || !Number.isSafeInteger(claims.exp) || claims.exp < now.getTime()) {
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

export async function createPlaybackGrant(
  payload: Payload,
  member: PilotMember,
  mediaAssetId: MediaAssetId,
  options: { now?: Date; providers?: MediaProviders } = {},
): Promise<PlaybackGrantResponse> {
  const now = options.now ?? new Date()
  const providers = options.providers ?? getFakeProviders()
  const owner = await activeUploader(payload, member)
  const asset = await ownedAsset(payload, owner, mediaAssetId)
  assertPlayable(asset, now)

  const playbackGrantId = newPlaybackGrantId()
  const expiresAt = new Date(now.getTime() + GRANT_LIFETIME_MS)
  const deliveryExpiresAt = new Date(now.getTime() + DELIVERY_LIFETIME_MS)
  await payload.create({
    collection: 'playback-grants',
    data: {
      asset: asset.id,
      deliveryExpiresAt: deliveryExpiresAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      owner: owner.id,
      playbackGrantId,
    },
    overrideAccess: true,
  })
  const playbackGrantToken = encodeClaims({
    asset: mediaAssetId,
    exp: expiresAt.getTime(),
    grant: playbackGrantId,
    kind: 'grant',
    owner: owner.id,
  }) as PlaybackGrantToken
  const deliveryToken = encodeClaims({
    asset: mediaAssetId,
    exp: deliveryExpiresAt.getTime(),
    grant: playbackGrantId,
    kind: 'delivery',
    owner: owner.id,
  }) as DeliveryToken
  const [delivery, drm] = await Promise.all([
    providers.delivery.authorize({
      expiresAt: deliveryExpiresAt,
      mediaAssetId,
      playbackGrantId,
      token: deliveryToken,
    }),
    providers.drm.createPlaybackContract({ playbackGrantId }),
  ])
  return {
    ...drm,
    deliveryExpiresAt: delivery.expiresAt,
    deliveryToken,
    expiresAt: expiresAt.toISOString(),
    manifestURL: delivery.manifestURL,
    playbackGrantId,
    playbackGrantToken,
  }
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
  const now = options.now ?? new Date()
  const providers = options.providers ?? getFakeProviders()
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
  const contract = providers.drm.createPlaybackContract({ playbackGrantId: claims.grant })
  const licence = await providers.drm.acquireTemporaryLicence({
    challenge: options.challenge ?? new Uint8Array(),
    drmContentId: asset.drmContentId!,
    playbackGrantId: claims.grant,
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
  return { mediaAssetId: claims.asset, playbackGrantId: claims.grant }
}
