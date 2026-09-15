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
| Video storage | Amazon AWS S3 | Bucket `esaral-video-bucket`, region `ap-south-1` (Mumbai), reserved HrizonMedia prefix `testing/` |
| Delivery | Amazon CloudFront | Dedicated distribution domain `d1uvxvupjr9my.cloudfront.net`; owner reports origin path `/testing` |
| Transcoding | SaladCloud Container Engine | Organization `hrizonmedia`; project `hrizonmedia-staging` inferred from the owner's confirmation of its creation; exact API names require verification |
| Packaging and DRM licensing | DoveRunner Multi-DRM, CLI packager | Site ID `GXIW`; owner authorizes the existing account/site also used by eSaral |

The owner reports adding $10 of Salad credits. No container group, queue,
worker endpoint, hardware selection, country placement or account quota has been
verified. Salad is compute infrastructure for an application-owned worker, not a
selected ready-made transcoding API. Runtime/image deployment belongs to the
subsequent adapter implementation.

The shared S3 bucket and DoveRunner site are approved for staging in the owner
conversation. Do not alter eSaral objects, bucket-wide behavior or active DRM
credentials. Scope object access and deletion to `testing/`; preserve eSaral's
CORS entries when the bucket administrator adds HrizonMedia's origin. This does
not approve reusing eSaral video infrastructure in production: parent #29's
production exclusion remains unresolved for the selected shared bucket/site.
Using the existing site is not evidence that embedded credentials were rotated;
rotation/revocation of the reference credentials remains an owner/admin checkpoint
and must be coordinated to avoid disrupting eSaral playback.

## Endpoints and object paths

| Purpose | Contract or location | Evidence |
| --- | --- | --- |
| Staging app | `https://hrizonmedia-staging-web-staging.up.railway.app` | Recorded in [issue #41 staging evidence](issue41.md) |
| S3 regional API | `https://esaral-video-bucket.s3.ap-south-1.amazonaws.com` | Derived from selected bucket/region; connectivity unverified |
| Reserved video namespace | `s3://esaral-video-bucket/testing/` | Owner supplied |
| CloudFront playback origin | `https://d1uvxvupjr9my.cloudfront.net` | Owner supplied; access control unverified |
| Salad public API | `https://api.salad.com/api/public` | [Official API quickstart](https://docs.salad.com/container-engine/tutorials/quickstart-api) |
| DoveRunner licence service | `https://drm-license.doverunner.com/ri/licenseManager.do` | [Official player integration](https://support.doverunner.com/hc/en-us/articles/47901652969881-What-client-players-does-DoveRunner-Multi-DRM-support); account policy unverified |
| Processing callback | `https://hrizonmedia-staging-web-staging.up.railway.app/api/internal/transcode/callback` | Existing application receiver |

The application requires logical output prefixes `outputs/{processingJobId}/`.
The proposed S3 adapter translates these to physical keys
`testing/outputs/{processingJobId}/...`; CloudFront's `/testing` origin path means
the viewer path would be `/outputs/{processingJobId}/...`, without a second
`testing/`. This mapping is not implemented or verified. Source-key and manifest
filename rules remain pending. Uploaded originals must not be deliverable through
CloudFront, including through the default behavior.

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
| `VIDEO_S3_ACCESS_KEY_ID` | Server S3 adapter; worker provisioning to be decided | Owner advanced to the next step; variable presence/permissions unverified |
| `VIDEO_S3_SECRET_ACCESS_KEY` | Server S3 adapter; worker provisioning to be decided | Owner explicitly confirmed saved |
| `VIDEO_S3_BUCKET`, `VIDEO_S3_REGION`, `VIDEO_S3_PREFIX` | Bucket, region and reserved prefix above | Owner advanced through setup steps; presence unverified |
| `VIDEO_CLOUDFRONT_DOMAIN` | Server delivery adapter | Owner advanced through setup; presence unverified |
| `DOVERUNNER_ENC_TOKEN` | CLI packaging worker | Owner explicitly confirmed saved on Railway; not installed on Salad yet |
| `DOVERUNNER_SITE_KEY`, `DOVERUNNER_ACCESS_KEY` | Server-side licence token generation | Owner advanced through setup steps; presence and account compatibility unverified |
| `DOVERUNNER_SITE_ID` | Server DRM adapter; `GXIW` | Owner advanced through setup; presence unverified |
| `SALAD_API_KEY` | Server dispatch/control adapter | Owner explicitly confirmed saved |
| `SALAD_ORGANIZATION_NAME`, `SALAD_PROJECT_NAME` | Server Salad API scope | Owner advanced through setup; exact names and presence unverified |

CloudFront signing key configuration is **pending**, deferred by the owner.
A key pair was generated locally outside Git, but no public key/key group upload
or private-key installation was confirmed. Private temporary file paths and key
contents are intentionally absent from this handoff. Recover the local key pair or
generate a replacement before uploading its public half; record the public-key ID
and install only the matching private half directly in the server configuration.

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
| Production | Real adapters verified; no fake providers or eSaral infrastructure reuse | Shared bucket/site production decision, coordinated embedded-credential rotation, shared rate limiting, and real staging verification remain pending |

Existing retention contracts remain: raw source cleanup 24 hours after successful
processing or 48 hours after failure; encrypted outputs expire seven days after
readiness. Admin must confirm versioning, Object Lock, encryption/KMS permissions
and lifecycle rules allow this without deleting other applications' objects.

## Before issue #42 can be completed

- [x] Providers and owner-supplied staging locations named.
- [x] Official operation documentation and public support routes linked.
- [ ] AWS admin confirms scoped app access, bucket settings and browser uploads.
- [ ] CloudFront signing and private origin configuration recorded and verified.
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
