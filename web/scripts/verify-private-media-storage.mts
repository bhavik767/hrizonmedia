import {
  GetBucketCorsCommand,
  GetBucketEncryptionCommand,
  GetBucketOwnershipControlsCommand,
  GetBucketPolicyCommand,
  GetPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { execFileSync } from 'node:child_process'

import {
  cloudFrontDeliveryViolations,
  privateMediaStorageViolations,
  unexpectedMediaRuntimePermissions,
} from '../src/media/private-storage'

const required = [
  'NEXT_PUBLIC_SERVER_URL',
  'VIDEO_CLOUDFRONT_DISTRIBUTION_ARN',
  'VIDEO_S3_APPLICATION_PRINCIPAL_ARN',
  'VIDEO_S3_BUCKET',
  'VIDEO_S3_REGION',
  'VIDEO_S3_WORKER_PRINCIPAL_ARN',
]
const missing = required.filter((name) => !process.env[name]?.trim())
if (missing.length) throw new Error(`Missing verification configuration: ${missing.join(', ')}`)

const bucket = process.env.VIDEO_S3_BUCKET!.trim()
const client = new S3Client({ region: process.env.VIDEO_S3_REGION!.trim() })
const [cors, encryption, ownership, policy, publicAccessBlock] = await Promise.all([
  client.send(new GetBucketCorsCommand({ Bucket: bucket })),
  client.send(new GetBucketEncryptionCommand({ Bucket: bucket })),
  client.send(new GetBucketOwnershipControlsCommand({ Bucket: bucket })),
  client.send(new GetBucketPolicyCommand({ Bucket: bucket })),
  client.send(new GetPublicAccessBlockCommand({ Bucket: bucket })),
])
const violations = privateMediaStorageViolations(
  { cors, encryption, ownership, policy, publicAccessBlock },
  {
    applicationOrigin: process.env.NEXT_PUBLIC_SERVER_URL!,
    bucketArn: `arn:aws:s3:::${bucket}`,
    cloudFrontDistributionArn: process.env.VIDEO_CLOUDFRONT_DISTRIBUTION_ARN!,
  },
)
if (violations.length)
  throw new Error(`Private media storage verification failed: ${violations.join(' ')}`)

function awsJSON(arguments_: string[]): unknown {
  return JSON.parse(
    execFileSync('aws', arguments_, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
  )
}

const distributionID = process.env.VIDEO_CLOUDFRONT_DISTRIBUTION_ARN!.split('/').at(-1)
if (!distributionID || !/^[A-Z0-9]+$/.test(distributionID)) {
  throw new Error('VIDEO_CLOUDFRONT_DISTRIBUTION_ARN must identify one distribution.')
}
const deliveryViolations = cloudFrontDeliveryViolations(
  awsJSON(['cloudfront', 'get-distribution-config', '--id', distributionID, '--output', 'json']),
  { bucket, region: process.env.VIDEO_S3_REGION!.trim() },
)
if (deliveryViolations.length) {
  throw new Error(`Protected delivery verification failed: ${deliveryViolations.join(' ')}`)
}

const unexpectedPermissions = [
  's3:DeleteBucket',
  's3:PutBucketCors',
  's3:PutBucketPolicy',
  's3:PutPublicAccessBlock',
  's3:GetObject',
  's3:PutObject',
  's3:DeleteObject',
]
const forbiddenResources = [
  `arn:aws:s3:::${bucket}`,
  `arn:aws:s3:::${bucket}/unrelated/never-authorized`,
]
for (const principal of [
  process.env.VIDEO_S3_APPLICATION_PRINCIPAL_ARN!,
  process.env.VIDEO_S3_WORKER_PRINCIPAL_ARN!,
]) {
  const simulated = awsJSON([
    'iam',
    'simulate-principal-policy',
    '--policy-source-arn',
    principal,
    '--action-names',
    ...unexpectedPermissions,
    '--resource-arns',
    ...forbiddenResources,
    '--output',
    'json',
  ]) as { EvaluationResults?: unknown[] }
  const permissionViolations = unexpectedMediaRuntimePermissions(simulated.EvaluationResults ?? [])
  if (permissionViolations.length) {
    throw new Error(`Least-privilege verification failed: ${permissionViolations.join(' ')}`)
  }
}
console.log('Private media storage verification passed.')
