import 'server-only'

import { readRealMediaProviderConfiguration } from '@/config/media-provider-environment.mjs'

import type { MediaProviders } from './contracts'
import { createCloudFrontDeliveryProvider } from './cloudfront'
import { createDoveRunnerDrmProvider } from './doverunner'
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
  const s3Configuration = {
    accessKeyId: configuration.s3AccessKeyId,
    bucket: configuration.s3Bucket,
    region: configuration.s3Region,
    secretAccessKey: configuration.s3SecretAccessKey,
  }

  return {
    delivery: createCloudFrontDeliveryProvider({
      domain: configuration.cloudFrontDomain,
      keyPairId: configuration.cloudFrontKeyPairId,
      privateKey: configuration.cloudFrontPrivateKey,
    }),
    drm: createDoveRunnerDrmProvider({
      accessKey: configuration.doveRunnerAccessKey,
      siteId: configuration.doveRunnerSiteId,
      siteKey: configuration.doveRunnerSiteKey,
    }),
    storage: createS3StorageProvider(s3Configuration),
    transcode: createSaladTranscodeProvider(
      {
        apiKey: configuration.saladApiKey,
        organizationName: configuration.saladOrganizationName,
        projectName: configuration.saladProjectName,
        queueName: configuration.saladQueueName,
        callbackOrigin: configuration.transcodeCallbackOrigin,
        webhookURL: configuration.saladWebhookURL,
      },
      {
        tombstone: createS3TranscodeTombstone(s3Configuration),
        verifyOutputs: createS3OutputVerifier(s3Configuration),
      },
    ),
  }
}
