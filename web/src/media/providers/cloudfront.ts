import 'server-only'

import { getSignedUrl } from '@aws-sdk/cloudfront-signer'

import type { DeliveryProvider } from './contracts'

const AUTHORIZATION_LIFETIME_MS = 60 * 1000

interface CloudFrontConfiguration {
  domain: string
  keyPairId: string
  privateKey: string
}

export function createCloudFrontDeliveryProvider(
  configuration: CloudFrontConfiguration,
  dependencies: { now?: () => Date } = {},
): DeliveryProvider {
  const now = dependencies.now ?? (() => new Date())
  const domain = configuration.domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error('CloudFront domain is invalid.')

  return {
    async authorize({ expiresAt, processingJobId }) {
      if (!processingJobId) throw new Error('Media Asset delivery is not ready.')
      const issuedAt = now()
      const authorizationExpiresAt = new Date(
        Math.min(expiresAt.getTime(), issuedAt.getTime() + AUTHORIZATION_LIFETIME_MS),
      )
      const outputRoot = `https://${domain}/${processingJobId}`
      const policy = JSON.stringify({
        Statement: [
          {
            Condition: { DateLessThan: { 'AWS:EpochTime': Math.floor(authorizationExpiresAt.getTime() / 1000) } },
            Resource: `${outputRoot}/*`,
          },
        ],
      })
      const manifestURL = getSignedUrl({
        keyPairId: configuration.keyPairId,
        policy,
        privateKey: configuration.privateKey,
        url: `${outputRoot}/manifest.mpd`,
      })
      const signed = new URL(manifestURL)
      return {
        expiresAt: authorizationExpiresAt.toISOString(),
        manifestURL,
        resourceAuthorization: {
          origin: signed.origin,
          pathPrefix: `/${processingJobId}/`,
          query: signed.search,
        },
      }
    },

    async revokeAsset() {
      // Database authorization is revoked synchronously. Already-issued edge URLs expire in <=60s.
    },
  }
}
