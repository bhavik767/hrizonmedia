import { describe, expect, it } from 'vitest'

import {
  cloudFrontDeliveryViolations,
  privateMediaStorageViolations,
  unexpectedMediaRuntimePermissions,
} from '@/media/private-storage'

const expectation = {
  applicationOrigin: 'https://staging.hrizonmedia.test',
  bucketArn: 'arn:aws:s3:::private-video',
  cloudFrontDistributionArn: 'arn:aws:cloudfront::123456789012:distribution/E123',
}

function secureSnapshot() {
  return {
    cors: {
      CORSRules: [
        {
          AllowedHeaders: ['content-type', 'x-amz-checksum-sha256'],
          AllowedMethods: ['PUT'],
          AllowedOrigins: [expectation.applicationOrigin],
          ExposeHeaders: ['ETag', 'x-amz-checksum-sha256'],
        },
      ],
    },
    encryption: {
      ServerSideEncryptionConfiguration: {
        Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
      },
    },
    ownership: { OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] } },
    policy: {
      Policy: JSON.stringify({
        Statement: [
          {
            Action: 's3:*',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
            Effect: 'Deny',
            Resource: [expectation.bucketArn, `${expectation.bucketArn}/*`],
          },
          {
            Action: 's3:GetObject',
            Condition: { StringEquals: { 'AWS:SourceArn': expectation.cloudFrontDistributionArn } },
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Resource: `${expectation.bucketArn}/outputs/*`,
          },
        ],
      }),
    },
    publicAccessBlock: {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    },
  }
}

describe('private media storage deployment contract', () => {
  it('accepts private, HTTPS-only storage with one exact browser origin and CloudFront-only output reads', () => {
    expect(privateMediaStorageViolations(secureSnapshot(), expectation)).toEqual([])
  })

  it('rejects public access and a wildcard CORS origin', () => {
    const snapshot = secureSnapshot()
    snapshot.cors.CORSRules[0]!.AllowedOrigins = ['*']
    snapshot.publicAccessBlock.PublicAccessBlockConfiguration.BlockPublicPolicy = false

    expect(privateMediaStorageViolations(snapshot, expectation)).toEqual([
      'S3 public-access blocking is incomplete.',
      'S3 CORS must permit only the configured origin to PUT checksummed parts.',
    ])
  })

  it('requires a private S3 output origin, HTTPS, and trusted CloudFront signing', () => {
    const snapshot = {
      DistributionConfig: {
        DefaultCacheBehavior: {
          TrustedKeyGroups: { Enabled: true, Quantity: 1 },
          ViewerProtocolPolicy: 'https-only',
        },
        Origins: {
          Items: [
            {
              DomainName: 'private-video.s3.ap-south-1.amazonaws.com',
              OriginAccessControlId: 'E123OAC',
              OriginPath: '/outputs',
            },
          ],
        },
      },
    }
    expect(
      cloudFrontDeliveryViolations(snapshot, { bucket: 'private-video', region: 'ap-south-1' }),
    ).toEqual([])
    snapshot.DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy = 'allow-all'
    expect(
      cloudFrontDeliveryViolations(snapshot, { bucket: 'private-video', region: 'ap-south-1' }),
    ).toEqual(['CloudFront playback behaviors must require HTTPS and a trusted signing key group.'])
  })

  it('reports any administrative or unrelated-prefix permission granted to a runtime identity', () => {
    expect(
      unexpectedMediaRuntimePermissions([
        {
          EvalActionName: 's3:PutBucketPolicy',
          EvalDecision: 'allowed',
          EvalResourceName: 'arn:aws:s3:::private-video',
        },
        {
          EvalActionName: 's3:GetObject',
          EvalDecision: 'implicitDeny',
          EvalResourceName: 'arn:aws:s3:::private-video/unrelated/never-authorized',
        },
      ]),
    ).toEqual([
      'Runtime identity unexpectedly permits s3:PutBucketPolicy on arn:aws:s3:::private-video.',
    ])
  })
})
