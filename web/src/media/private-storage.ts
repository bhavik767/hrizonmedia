export interface PrivateMediaStorageSnapshot {
  cors?: {
    CORSRules?: Array<{
      AllowedHeaders?: string[]
      AllowedMethods?: string[]
      AllowedOrigins?: string[]
      ExposeHeaders?: string[]
    }>
  }
  encryption?: {
    ServerSideEncryptionConfiguration?: {
      Rules?: Array<{ ApplyServerSideEncryptionByDefault?: { SSEAlgorithm?: string } }>
    }
  }
  ownership?: { OwnershipControls?: { Rules?: Array<{ ObjectOwnership?: string }> } }
  policy?: { Policy?: string }
  publicAccessBlock?: {
    PublicAccessBlockConfiguration?: {
      BlockPublicAcls?: boolean
      BlockPublicPolicy?: boolean
      IgnorePublicAcls?: boolean
      RestrictPublicBuckets?: boolean
    }
  }
}

export interface PrivateMediaStorageExpectation {
  applicationOrigin: string
  bucketArn: string
  cloudFrontDistributionArn: string
}

export interface CloudFrontDeliverySnapshot {
  DistributionConfig?: {
    CacheBehaviors?: { Items?: CloudFrontCacheBehavior[] }
    DefaultCacheBehavior?: CloudFrontCacheBehavior
    Origins?: {
      Items?: Array<{ DomainName?: string; OriginAccessControlId?: string; OriginPath?: string }>
    }
  }
}

interface CloudFrontCacheBehavior {
  TrustedKeyGroups?: { Enabled?: boolean; Quantity?: number }
  ViewerProtocolPolicy?: string
}

export interface CloudFrontDeliveryExpectation {
  bucket: string
  region: string
}

export interface PolicyEvaluation {
  EvalActionName?: string
  EvalDecision?: string
  EvalResourceName?: string
}

function sameMembers(actual: string[] | undefined, expected: string[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value))
  )
}

function statementMatches(
  value: unknown,
  predicate: (statement: Record<string, unknown>) => boolean,
): boolean {
  if (!value || typeof value !== 'object') return false
  const statements = (value as { Statement?: unknown }).Statement
  if (!Array.isArray(statements)) return false
  return statements.some(
    (statement) =>
      Boolean(statement) &&
      typeof statement === 'object' &&
      predicate(statement as Record<string, unknown>),
  )
}

function includes(value: unknown, required: string): boolean {
  return value === required || (Array.isArray(value) && value.includes(required))
}

export function privateMediaStorageViolations(
  snapshot: PrivateMediaStorageSnapshot,
  expectation: PrivateMediaStorageExpectation,
): string[] {
  const violations: string[] = []
  let origin: string
  try {
    const parsed = new URL(expectation.applicationOrigin)
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('invalid origin')
    }
    origin = parsed.origin
  } catch {
    return ['The configured browser origin must be one exact HTTPS origin.']
  }

  const publicAccess = snapshot.publicAccessBlock?.PublicAccessBlockConfiguration
  if (
    !publicAccess?.BlockPublicAcls ||
    !publicAccess.BlockPublicPolicy ||
    !publicAccess.IgnorePublicAcls ||
    !publicAccess.RestrictPublicBuckets
  ) {
    violations.push('S3 public-access blocking is incomplete.')
  }
  if (
    snapshot.ownership?.OwnershipControls?.Rules?.some(
      ({ ObjectOwnership }) => ObjectOwnership === 'BucketOwnerEnforced',
    ) !== true
  ) {
    violations.push('S3 object ownership must disable ACLs.')
  }
  if (
    snapshot.encryption?.ServerSideEncryptionConfiguration?.Rules?.some(
      ({ ApplyServerSideEncryptionByDefault }) =>
        ApplyServerSideEncryptionByDefault?.SSEAlgorithm === 'AES256',
    ) !== true
  ) {
    violations.push('S3 default SSE-S3 encryption is missing.')
  }

  const corsRules = snapshot.cors?.CORSRules
  const expectedHeaders = ['content-type', 'x-amz-checksum-sha256']
  const expectedExposedHeaders = ['ETag', 'x-amz-checksum-sha256']
  if (
    !Array.isArray(corsRules) ||
    corsRules.length !== 1 ||
    !sameMembers(corsRules[0]?.AllowedOrigins, [origin]) ||
    !sameMembers(corsRules[0]?.AllowedMethods, ['PUT']) ||
    !sameMembers(
      corsRules[0]?.AllowedHeaders?.map((header) => header.toLowerCase()),
      expectedHeaders,
    ) ||
    !sameMembers(corsRules[0]?.ExposeHeaders, expectedExposedHeaders)
  ) {
    violations.push('S3 CORS must permit only the configured origin to PUT checksummed parts.')
  }

  let policy: unknown
  try {
    policy = snapshot.policy?.Policy ? JSON.parse(snapshot.policy.Policy) : undefined
  } catch {
    policy = undefined
  }
  const objectArn = `${expectation.bucketArn}/*`
  if (
    !statementMatches(
      policy,
      (statement) =>
        statement.Effect === 'Deny' &&
        includes(statement.Action, 's3:*') &&
        includes(statement.Resource, expectation.bucketArn) &&
        includes(statement.Resource, objectArn) &&
        (statement.Condition as { Bool?: Record<string, unknown> } | undefined)?.Bool?.[
          'aws:SecureTransport'
        ] === 'false',
    )
  ) {
    violations.push('S3 bucket policy must deny non-HTTPS access.')
  }
  if (
    !statementMatches(
      policy,
      (statement) =>
        statement.Effect === 'Allow' &&
        includes(statement.Action, 's3:GetObject') &&
        includes(statement.Resource, `${expectation.bucketArn}/outputs/*`) &&
        (statement.Principal as { Service?: unknown } | undefined)?.Service ===
          'cloudfront.amazonaws.com' &&
        (statement.Condition as { StringEquals?: Record<string, unknown> } | undefined)
          ?.StringEquals?.['AWS:SourceArn'] === expectation.cloudFrontDistributionArn,
    )
  ) {
    violations.push('S3 output reads must be limited to the configured CloudFront distribution.')
  }
  return violations
}

export function cloudFrontDeliveryViolations(
  snapshot: CloudFrontDeliverySnapshot,
  expectation: CloudFrontDeliveryExpectation,
): string[] {
  const distribution = snapshot.DistributionConfig
  const expectedOrigin = `${expectation.bucket}.s3.${expectation.region}.amazonaws.com`
  if (
    !distribution?.Origins?.Items?.some(
      ({ DomainName, OriginAccessControlId, OriginPath }) =>
        DomainName === expectedOrigin && OriginAccessControlId && OriginPath === '/outputs',
    )
  ) {
    return [
      'CloudFront must use the private video bucket outputs origin through Origin Access Control.',
    ]
  }
  const behaviors = [
    distribution.DefaultCacheBehavior,
    ...(distribution.CacheBehaviors?.Items ?? []),
  ]
  if (
    behaviors.some(
      (behavior) =>
        behavior?.ViewerProtocolPolicy !== 'https-only' ||
        behavior.TrustedKeyGroups?.Enabled !== true ||
        !behavior.TrustedKeyGroups.Quantity,
    )
  ) {
    return ['CloudFront playback behaviors must require HTTPS and a trusted signing key group.']
  }
  return []
}

export function unexpectedMediaRuntimePermissions(evaluations: PolicyEvaluation[]): string[] {
  return evaluations
    .filter(({ EvalDecision }) => EvalDecision === 'allowed')
    .map(
      ({ EvalActionName, EvalResourceName }) =>
        `Runtime identity unexpectedly permits ${EvalActionName ?? 'an action'} on ${EvalResourceName ?? 'a resource'}.`,
    )
}
