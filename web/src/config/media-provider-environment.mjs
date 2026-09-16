export const REAL_MEDIA_PROVIDER_VARIABLES = [
  'VIDEO_S3_ACCESS_KEY_ID',
  'VIDEO_S3_SECRET_ACCESS_KEY',
  'VIDEO_S3_BUCKET',
  'VIDEO_S3_REGION',
  'VIDEO_CLOUDFRONT_DOMAIN',
  'VIDEO_CLOUDFRONT_KEY_PAIR_ID',
  'VIDEO_CLOUDFRONT_PRIVATE_KEY',
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
  }
}
