import 'server-only'

import { readRealMediaProviderConfiguration } from '@/config/media-provider-environment.mjs'

import type { MediaProviders } from './contracts'
import { createCloudFrontDeliveryProvider } from './cloudfront'
import { getFakeProviders } from './fake'
import {
  createS3OutputVerifier,
  createS3StorageProvider,
  createS3TranscodeTombstone,
} from './s3'
import { createSaladTranscodeProvider } from './salad'

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
  providers.transcode = createSaladTranscodeProvider(
    {
      apiKey: configuration.saladApiKey,
      organizationName: configuration.saladOrganizationName,
      projectName: configuration.saladProjectName,
      queueName: configuration.saladQueueName,
      webhookURL: configuration.saladWebhookURL,
    },
    {
      tombstone: createS3TranscodeTombstone({
        accessKeyId: configuration.s3AccessKeyId,
        bucket: configuration.s3Bucket,
        region: configuration.s3Region,
        secretAccessKey: configuration.s3SecretAccessKey,
      }),
      verifyOutputs: createS3OutputVerifier({
        accessKeyId: configuration.s3AccessKeyId,
        bucket: configuration.s3Bucket,
        region: configuration.s3Region,
        secretAccessKey: configuration.s3SecretAccessKey,
      }),
    },
  )
  return providers
}
