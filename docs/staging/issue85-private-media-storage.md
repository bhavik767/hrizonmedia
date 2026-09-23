# Issue #85: private media storage and protected delivery

Source: [issue #85](https://github.com/bhavik767/hrizonmedia/issues/85). This
record is a deployment contract for the dedicated video bucket; it intentionally
contains no credential values or presigned URLs.

## Required bucket boundary

- Enable all four S3 Block Public Access settings and Bucket owner enforced
  ownership (ACLs disabled).
- Set the bucket's default encryption to SSE-S3 (`AES256`). The application also
  requests SSE-S3 for every source multipart upload, so an individual upload
  cannot silently rely on a permissive bucket default.
- Bucket policy must deny `aws:SecureTransport=false` for both the bucket ARN and
  all object ARNs. It may allow `s3:GetObject` on `outputs/*` only to
  `cloudfront.amazonaws.com` where `AWS:SourceArn` equals this environment's
  CloudFront distribution ARN. Do not allow a public principal.
- Configure exactly one CORS rule for this environment's
  `NEXT_PUBLIC_SERVER_URL`: `PUT`, request headers `content-type` and
  `x-amz-checksum-sha256`, and exposed headers `ETag` and
  `x-amz-checksum-sha256`. Do not use `*` for origins, methods, or headers.
- Give the application and transcoder identities only the prefix/action pairs
  they use: multipart operations for `sources/*`; worker read/write and
  tombstone operations for its assigned source/output prefixes; application
  output cleanup for `outputs/*`. Bucket-policy administration and public-read
  permissions belong to neither runtime identity.

CloudFront remains the only playback origin. The delivery provider emits an HTTPS
custom-policy authorization for one canonical Processing Job output prefix, valid
for at most 60 seconds; standard and DRM playback both use it. Browser uploads use
per-part presigned URLs and receive no static AWS credentials.

## Verification

Run the following with a separately provisioned deployment-audit AWS identity.
It requires `s3:GetBucketCORS`, `s3:GetBucketEncryption`,
`s3:GetBucketOwnershipControls`, `s3:GetBucketPolicy`, and
`s3:GetPublicAccessBlock` on the video bucket, `cloudfront:GetDistributionConfig`
on the distribution, and `iam:SimulatePrincipalPolicy` for both runtime
principals. It does not need any media-object permission.

```sh
NEXT_PUBLIC_SERVER_URL=https://your-environment.example \
VIDEO_S3_BUCKET=your-private-video-bucket \
VIDEO_S3_REGION=ap-south-1 \
VIDEO_CLOUDFRONT_DISTRIBUTION_ARN=arn:aws:cloudfront::ACCOUNT:distribution/DISTRIBUTION \
VIDEO_S3_APPLICATION_PRINCIPAL_ARN=arn:aws:iam::ACCOUNT:role/application-media \
VIDEO_S3_WORKER_PRINCIPAL_ARN=arn:aws:iam::ACCOUNT:role/transcoder-media \
npm run verify:private-media-storage
```

The verifier is deliberately read-only and returns a fixed failure summary; it
never prints bucket policies, credentials, or signed URLs. It rejects public S3,
unexpected browser origins, non-HTTPS or unsigned CloudFront behaviors, and
runtime identities that can administer the bucket or access an unrelated prefix.
Run it independently for staging and production before enabling playback in either
environment. Perform the allowed-origin and rejected-origin presigned multipart
browser checks in the existing staging Playwright suite before release.
