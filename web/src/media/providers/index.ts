import 'server-only'

import { readRealMediaProviderConfiguration } from '@/config/media-provider-environment.mjs'

import type { MediaProviders } from './contracts'
import { createCloudFrontDeliveryProvider } from './cloudfront'
import { getFakeProviders } from './fake'
import { createS3StorageProvider } from './s3'

export function getMediaProviders(environment: NodeJS.ProcessEnv = process.env): MediaProviders {
  const configuration = readRealMediaProviderConfiguration(environment)
  if (!configuration) return getFakeProviders(environment)

  const providers: MediaProviders = getFakeProviders(environment)
  providers.storage = createS3StorageProvider({
    accessKeyId: configuration.s3AccessKeyId,
    bucket: configuration.s3Bucket,
    region: configuration.s3Region,
    secretAccessKey: configuration.s3SecretAccessKey,
  })
  providers.delivery = createCloudFrontDeliveryProvider({
    domain: configuration.cloudFrontDomain,
    keyPairId: configuration.cloudFrontKeyPairId,
    privateKey: configuration.cloudFrontPrivateKey,
  })
  return providers
}
