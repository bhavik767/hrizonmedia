# Issue #42: real video provider handoff

Status: **draft; provider selection recorded, access and contract acceptance incomplete**.
Updated: 2026-09-16. Source: [issue #42](https://github.com/bhavik767/hrizonmedia/issues/42)
and its [parent specification #29](https://github.com/bhavik767/hrizonmedia/issues/29).
Branch review fixed point: `24f5293a9d75372debb2ba4c5aaaee29c5989aec`.

This document supplies the non-secret handoff for later real adapters. The
application still uses deterministic fake providers. Values saved in Railway do
not activate real storage, transcoding, delivery or DRM. Production remains gated
under [ADR 0006](../adr/0006-deterministic-provider-boundaries.md).

## Owner decisions

| Capability | Selected product | Non-secret deployment details |
| --- | --- | --- |
| Video storage | Amazon AWS S3 | Dedicated bucket `hrizonmedia-video-staging-1`, region `ap-south-1` (Mumbai), in the new HrizonMedia AWS account |
| Delivery | Amazon CloudFront | Dedicated distribution `E29HCZO423N67`, domain `dbjfbyqkep4un.cloudfront.net`, with S3 origin path `/outputs` |
| Transcoding | SaladCloud Container Engine | Organization `hrizonmedia`; project `hrizonmedia-staging` inferred from the owner's confirmation of its creation; exact API names require verification |
| Packaging and DRM licensing | DoveRunner Multi-DRM, CLI packager | Site ID `GXIW`; owner authorizes the existing account/site also used by eSaral |

The owner reports adding $10 of Salad credits. No container group, queue,
worker endpoint, hardware selection, country placement or account quota has been
verified. Salad is compute infrastructure for an application-owned worker, not a
selected ready-made transcoding API. Runtime/image deployment belongs to the
subsequent adapter implementation.

The S3 bucket and CloudFront distribution are isolated in the new HrizonMedia AWS
account. The DoveRunner site remains shared with eSaral and is approved only for
staging in the owner conversation. Do not alter active DRM credentials. This does
not approve reusing the shared DoveRunner site in production: parent #29's
production exclusion remains unresolved for that site. Using the existing site is
not evidence that embedded credentials were rotated; rotation/revocation of the
reference credentials remains an owner/admin checkpoint and must be coordinated to
avoid disrupting eSaral playback.

## Endpoints and object paths

| Purpose | Contract or location | Evidence |
| --- | --- | --- |
| Staging app | `https://hrizonmedia-staging-web-staging.up.railway.app` | Recorded in [issue #41 staging evidence](issue41.md) |
| S3 regional API | `https://hrizonmedia-video-staging-1.s3.ap-south-1.amazonaws.com` | Derived from selected bucket/region; connectivity unverified |
| Video namespace | `s3://hrizonmedia-video-staging-1/` | Dedicated bucket; no global application prefix |
| CloudFront playback origin | `https://dbjfbyqkep4un.cloudfront.net` | Owner supplied; signed playback remains unverified end to end |
| Salad public API | `https://api.salad.com/api/public` | [Official API quickstart](https://docs.salad.com/container-engine/tutorials/quickstart-api) |
| DoveRunner licence service | `https://drm-license.doverunner.com/ri/licenseManager.do` | [Official player integration](https://support.doverunner.com/hc/en-us/articles/47901652969881-What-client-players-does-DoveRunner-Multi-DRM-support); account policy unverified |
| Processing callback | `https://hrizonmedia-staging-web-staging.up.railway.app/api/internal/transcode/callback` | Existing application receiver |

The application requires logical output prefixes `outputs/{processingJobId}/`.
The S3 adapter will store those physical keys unchanged. CloudFront's `/outputs`
origin path means the viewer path must omit that first segment, for example
`/{processingJobId}/manifest.mpd`; the delivery adapter must perform this mapping.
This mapping is not implemented or verified. Source-key and manifest filename
rules remain pending. Because the origin is rooted at `/outputs`, uploaded originals
under `sources/` are outside the delivery namespace.

The owner reports that the bucket blocks public access, uses ACLs-disabled object
ownership and SSE-S3, and has versioning disabled. Browser CORS permits `PUT` only
from `https://hrizonmedia-staging-web-staging.up.railway.app`, permits all request
headers, and exposes `ETag` and `x-amz-checksum-sha256`. A lifecycle rule aborts
incomplete multipart uploads after two days. The application IAM user
`hrizonmedia-staging-media` has bucket-location/list/multipart-list permissions and
object get/put/delete/abort/list-parts permissions scoped to this bucket. These are
owner-reported settings; a real multipart upload has not verified them.

The callback protocol is documented in [staged Demo security](../security/staged-demo.md):
unique `callbackId`, known `providerJobId`, exact logical `outputPrefix`, and
`ready`/`failed` status; HMAC-SHA256 binds the timestamp and raw JSON body.
The headers are `x-hrizon-timestamp` and `x-hrizon-signature`, freshness is five
minutes and bodies are bounded to 16 KiB. Identical authenticated replay returns
204; rebinding an event ID to different content returns 409. Salad's native
completion webhook is not established as compatible; an application-owned worker
callback or authenticated translator must satisfy this contract.

## Official contracts and support

Documentation checked on 2026-09-16. Published capabilities do not verify this
account's configuration or settle the open compatibility decisions below.

| Provider | Upload / dispatch | Signing / authentication | Deletion / callbacks / retries / limits |
| --- | --- | --- | --- |
| AWS S3 | [Multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) | [Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html), [CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html) | [DeleteObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html), [multipart limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html); upload completion is verified by the application, not a transcoder callback |
| CloudFront | S3 is the upload destination; CloudFront serves outputs | [Trusted signers and key groups](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html), [private S3 origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) | [Cache invalidation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html); storage deletion belongs to S3, processing callbacks/retries belong to the worker |
| SaladCloud | [Create queue](https://docs.salad.com/reference/saladcloud-api/queues/create-queue), [create job and completion webhook](https://docs.salad.com/reference/saladcloud-api/queues/create-job) | [API authentication and rate limits](https://docs.salad.com/reference/api-usage) | [Queue retries](https://docs.salad.com/container-engine/explanation/job-processing/job-queues), [organization replica quotas](https://docs.salad.com/container-engine/reference/quotas); worker outputs are deleted from S3, not from Salad local disk alone |
| DoveRunner | [Packaging integration](https://docs.doverunner.com/content-security/multi-drm/packaging/), [CLI packager](https://docs.doverunner.com/content-security/multi-drm/packaging/cli-packager/) | [Licence token / backend proxy specification](https://docs.doverunner.com/content-security/multi-drm/license/license-token/) | [Account pricing/limits](https://doverunner.com/pricing/); media deletion remains in S3; the new integration should use token/proxy licensing rather than the deprecated licence callback method |

Support routes: [AWS Support Center](https://console.aws.amazon.com/support/home),
[SaladCloud support](https://docs.salad.com/support), and
[DoveRunner Help Center](https://support.doverunner.com/hc/en-us/requests/new).
Named account contacts, support plans and escalation response times remain pending;
no direct account-specific contact has been supplied.

## Railway configuration inventory

Target: existing project `hrizonmedia`, environment `staging`, service
`hrizonmedia-staging-web`. The owner installed values directly, not through GitHub.
Only names and non-secret settings are recorded here. These are proposed real
adapter settings and are not currently consumed by the fake-provider runtime.

| Variable | Purpose / future consumer | Installation evidence |
| --- | --- | --- |
| `VIDEO_S3_ACCESS_KEY_ID` | Server S3 adapter; worker provisioning to be decided | Owner explicitly confirmed replacing it with the dedicated app-user key |
| `VIDEO_S3_SECRET_ACCESS_KEY` | Server S3 adapter; worker provisioning to be decided | Owner explicitly confirmed saved |
| `VIDEO_S3_BUCKET`, `VIDEO_S3_REGION` | Dedicated bucket and Mumbai region above | Owner explicitly confirmed replacing the values |
| `VIDEO_S3_PREFIX` | Must be absent; logical `sources/` and `outputs/` keys are bucket-root relative | Owner explicitly confirmed deleting the old shared-bucket prefix |
| `VIDEO_CLOUDFRONT_DOMAIN` | Server delivery adapter | Owner explicitly confirmed replacing it with the dedicated distribution domain |
| `VIDEO_CLOUDFRONT_KEY_PAIR_ID` | CloudFront signed-URL key ID `K3C8Y1YFXKCO19` | Owner explicitly confirmed installation |
| `VIDEO_CLOUDFRONT_PRIVATE_KEY` | Server-only signed-URL private key | Owner explicitly confirmed installation; value is intentionally absent here |
| `DOVERUNNER_ENC_TOKEN` | CLI packaging worker | Owner explicitly confirmed saved on Railway; not installed on Salad yet |
| `DOVERUNNER_SITE_KEY`, `DOVERUNNER_ACCESS_KEY` | Server-side licence token generation | Owner advanced through setup steps; presence and account compatibility unverified |
| `DOVERUNNER_SITE_ID` | Server DRM adapter; `GXIW` | Owner advanced through setup; presence unverified |
| `SALAD_API_KEY` | Server dispatch/control adapter | Owner explicitly confirmed saved |
| `SALAD_ORGANIZATION_NAME`, `SALAD_PROJECT_NAME` | Server Salad API scope | Owner advanced through setup; exact names and presence unverified |

CloudFront public key `K3C8Y1YFXKCO19` belongs to key group
`d3876259-cc9f-4b5e-a55a-f8eaa1691f2e`. The owner reports that the default cache
behavior trusts this key group, the origin uses recommended private S3 access, and
the generated bucket policy names the CloudFront service and distribution. The
matching private key was installed directly in Railway and remains outside Git.
Actual signed manifest and segment requests, expiry and revocation are unverified.

The CMS variables `BUCKET`, `ENDPOINT`, `ACCESS_KEY_ID`, and `SECRET_ACCESS_KEY`
belong to CMS storage and must remain separate. Never use `NEXT_PUBLIC_*` for
provider credentials. Worker secret installation, installation dates and
credential-safe connectivity evidence remain pending; do not dump Railway
variables or provider responses into logs to collect that evidence.

## Limits and cost

- Pilot contract: MP4/MKV up to 2 GiB/two hours; 24-hour Upload Session; no
  upload-count quotas. S3 permits 10,000 parts, 5 MiB minimum except the final
  part, and paginates part listings at 1,000. Use the linked multipart specification
  rather than treating a multipart ETag as a content checksum.
- App concurrency defaults to two, unless persisted Operator controls override
  it. The selected Salad account's replica quota and actual processing concurrency
  are unverified. Its documented API limit is 240 requests/minute per key.
- App processing targets: dispatch within 30 seconds and ten-minute 1080p readiness
  within 15 minutes; H.264 video/AAC audio at 360p, 480p, 720p and 1080p where
  the source supports them, with no upscaling; two automatic retries (three total
  attempts). Salad's queue
  permits three retries (four total attempts), including interrupted workers.
- Owner's initial workload estimate is 100 GB, with duration/frequency unconfirmed.
  At an assumed 5 Mbps this is about 44 hours of source video. The earlier
  $2-$17 Salad compute estimate assumed 10-50 total worker-hours at the published
  $0.16-$0.33 RTX 4090 hourly rates available when estimated. This is not a
  measured throughput result or an approved monthly ceiling; verify the live
  hardware rate before provisioning. Idle running workers are billed too.
  See [Salad pricing](https://salad.com/pricing/) and [billing](https://docs.salad.com/general/explanation/billing).
- S3 storage/requests and outbound transfer to Salad, CloudFront viewing traffic,
  and DoveRunner licences are additional. Actual output bytes, viewing traffic,
  billing allowances and shared-account usage are unknown; there is no verified
  all-in cost estimate. See [S3 pricing](https://aws.amazon.com/s3/pricing/),
  [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/), and
  [DoveRunner pricing](https://doverunner.com/pricing/).

## Open compatibility and acceptance decisions

Canonical interfaces: [StorageProvider, TranscodeProvider, DeliveryProvider and DrmProvider](../../web/src/media/providers/contracts.ts).
These are explicit unresolved mismatches, not approved interface changes.

| Boundary | Required behavior | Remaining resolution / evidence |
| --- | --- | --- |
| Storage / multipart | Stable provider upload ID; part receipts with size, ETag and SHA-256; resume and completion verification | Map S3 native IDs/receipts to branded app IDs; verify checksum pagination, prefix enforcement, browser CORS and permissions |
| Storage / probe | Server-verified media size, MIME type, dimensions and duration before queueing | S3 metadata alone cannot probe video; select and validate trusted private-source probing without trusting the browser |
| Transcode / queue and status | Stable app idempotency key, branded job ID, processing/ready status and permanent/transient errors | Resolve Salad uncertain dispatch and duplicate jobs; map native states; worker readiness requires verified encrypted outputs |
| Transcode / retries and deletion | Three total attempts, leased jobs and no output recreation after deletion | Resolve Salad's four-attempt retry behavior without multiplying retries; settle cancellation, late callbacks and cleanup of every attempt |
| Callback | Signed, replay-bound, exact logical output prefix | Resolve native webhook mismatch; prove worker/translator HMAC and callback retries |
| Delivery | Asset-scoped manifests AND segments, temporary access, immediate revocation | Configure signing/OAC, prove originals inaccessible, and resolve already-issued URL revocation; deleting S3 objects or asynchronous cache invalidation alone is not proof of immediate denial |
| DRM | Distinct Content ID, backend check before every licence, five-minute start grant and temporary streaming | Verify DoveRunner proxy response format and policy: allow full viewing after the start window without offline/persistent licences; account keys must match the worker's packaging keys |
| Production | Real adapters verified; no fake providers or eSaral infrastructure reuse | Dedicated AWS storage/delivery are selected; shared DoveRunner-site replacement, coordinated embedded-credential rotation, shared rate limiting, and real staging verification remain pending |

Existing retention contracts remain: raw source cleanup 24 hours after successful
processing or 48 hours after failure; encrypted outputs expire seven days after
readiness. Admin must confirm versioning, Object Lock, encryption/KMS permissions
and lifecycle rules allow this without deleting other applications' objects.

## Before issue #42 can be completed

- [x] Providers and owner-supplied staging locations named.
- [x] Official operation documentation and public support routes linked.
- [ ] AWS access and bucket settings are recorded; verify them with a real browser multipart upload.
- [ ] CloudFront signing/private-origin configuration is recorded; verify signed manifest and segment access, expiry, and source denial.
- [ ] Salad scope, quotas, hardware limits, worker/callback contract and retry policy resolved.
- [ ] All required secrets installed directly in Railway; names/presence checked
  without exposing values; Salad worker installation recorded when provisioned.
- [ ] Account-specific cost/concurrency limits, spending ceiling, production settings
  and support contacts supplied.
- [ ] Every interface mismatch above explicitly resolved and accepted.

After real adapters are implemented, use the parent issue's pre-agreed route/Payload
and Playwright seams, then Railway security/performance verification. Prove private
delivery, cross-member denial, callback integrity/replay, retries, deletion/retention,
five-minute grant semantics and Chrome/Edge Widevine playback. FairPlay and
PlayReady require separate verification before Multi-DRM marketing claims ship.
