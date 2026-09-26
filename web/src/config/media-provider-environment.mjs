export const REAL_MEDIA_PROVIDER_VARIABLES = [
  'VIDEO_S3_ACCESS_KEY_ID',
  'VIDEO_S3_SECRET_ACCESS_KEY',
  'VIDEO_S3_BUCKET',
  'VIDEO_S3_REGION',
  'VIDEO_CLOUDFRONT_DOMAIN',
  'VIDEO_CLOUDFRONT_KEY_PAIR_ID',
  'VIDEO_CLOUDFRONT_PRIVATE_KEY',
  'SALAD_API_KEY',
  'SALAD_ORGANIZATION_NAME',
  'SALAD_PROJECT_NAME',
  'SALAD_QUEUE_NAME',
  'SALAD_WEBHOOK_SECRET',
  'DOVERUNNER_SITE_ID',
  'DOVERUNNER_SITE_KEY',
  'DOVERUNNER_ACCESS_KEY',
]

/**
 * @param {NodeJS.ProcessEnv} environment
 * @returns {null | {
 *   cloudFrontDomain: string,
 *   cloudFrontKeyPairId: string,
 *   cloudFrontPrivateKey: string,
 *   s3AccessKeyId: string,
 *   s3Bucket: string,
 *   s3Region: string,
 *   s3SecretAccessKey: string,
 *   saladApiKey: string,
 *   saladOrganizationName: string,
 *   saladProjectName: string,
 *   saladQueueName: string,
 *   transcodeCallbackSecret: string,
 *   transcodeCallbackOrigin: string,
 *   saladWebhookURL: string,
 *   doveRunnerAccessKey: string,
 *   doveRunnerSiteId: string,
 *   doveRunnerSiteKey: string,
 * }}
 */
export function readRealMediaProviderConfiguration(environment) {
  const configured = REAL_MEDIA_PROVIDER_VARIABLES.filter((name) => environment[name]?.trim())
  if (configured.length === 0) return null
  const missing = REAL_MEDIA_PROVIDER_VARIABLES.filter((name) => !environment[name]?.trim())
  if (missing.length) {
    throw new Error(`Real media providers are partially configured; missing: ${missing.join(', ')}`)
  }
  return {
    cloudFrontDomain: environment.VIDEO_CLOUDFRONT_DOMAIN.trim(),
    cloudFrontKeyPairId: environment.VIDEO_CLOUDFRONT_KEY_PAIR_ID.trim(),
    cloudFrontPrivateKey: environment.VIDEO_CLOUDFRONT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    s3AccessKeyId: environment.VIDEO_S3_ACCESS_KEY_ID.trim(),
    s3Bucket: environment.VIDEO_S3_BUCKET.trim(),
    s3Region: environment.VIDEO_S3_REGION.trim(),
    s3SecretAccessKey: environment.VIDEO_S3_SECRET_ACCESS_KEY.trim(),
    saladApiKey: environment.SALAD_API_KEY.trim(),
    saladOrganizationName: environment.SALAD_ORGANIZATION_NAME.trim(),
    saladProjectName: environment.SALAD_PROJECT_NAME.trim(),
    saladQueueName: environment.SALAD_QUEUE_NAME.trim(),
    transcodeCallbackSecret: environment.TRANSCODER_CALLBACK_SECRET.trim(),
    transcodeCallbackOrigin: new URL(environment.NEXT_PUBLIC_SERVER_URL.trim()).origin,
    doveRunnerAccessKey: environment.DOVERUNNER_ACCESS_KEY.trim(),
    doveRunnerSiteId: environment.DOVERUNNER_SITE_ID.trim(),
    doveRunnerSiteKey: environment.DOVERUNNER_SITE_KEY.trim(),
    saladWebhookURL: new URL(
      '/api/internal/salad/webhook',
      environment.NEXT_PUBLIC_SERVER_URL.trim(),
    ).toString(),
  }
}
