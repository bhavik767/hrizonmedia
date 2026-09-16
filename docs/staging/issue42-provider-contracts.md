# Issue #42: real video provider handoff

Status: **complete; provider selection, access handoff and contract decisions recorded**.
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
| S3 regional API | `https://hrizonmedia-video-staging-1.s3.ap-south-1.amazonaws.com` | An unauthenticated HEAD on 2026-09-16 returned 403 and `x-amz-bucket-region: ap-south-1`, confirming the private bucket and region without proving credential access |
| Video namespace | `s3://hrizonmedia-video-staging-1/` | Dedicated bucket; no global application prefix |
| CloudFront playback origin | `https://dbjfbyqkep4un.cloudfront.net` | Unauthenticated root and nonexistent-manifest requests returned CloudFront 403 on 2026-09-16; signed playback remains unverified end to end |
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
The resulting adapter decisions and primary-source rationale are recorded in
[the provider-contract research](issue42-provider-research.md).

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
| `VIDEO_S3_ACCESS_KEY_ID` | Server S3 adapter; worker provisioning to be decided | Missing in the Railway CLI name-only audit on 2026-09-16 |
| `VIDEO_S3_SECRET_ACCESS_KEY` | Server S3 adapter; worker provisioning to be decided | Missing in the Railway CLI name-only audit on 2026-09-16 |
| `VIDEO_S3_BUCKET`, `VIDEO_S3_REGION` | Dedicated bucket and Mumbai region above | Installed without deployment and verified present by name on 2026-09-16 |
| `VIDEO_S3_PREFIX` | Must be absent; logical `sources/` and `outputs/` keys are bucket-root relative | Correctly absent in the 2026-09-16 audit |
| `VIDEO_CLOUDFRONT_DOMAIN` | Server delivery adapter | Installed without deployment and verified present by name on 2026-09-16 |
| `VIDEO_CLOUDFRONT_KEY_PAIR_ID` | CloudFront signing key ID `K3C8Y1YFXKCO19` | Installed without deployment and verified present by name on 2026-09-16 |
| `VIDEO_CLOUDFRONT_PRIVATE_KEY` | Server-only signed-cookie private key | Owner confirms it is set in the Railway staging dashboard; value remains outside Git |
| `DOVERUNNER_ENC_TOKEN` | CLI packaging worker | Owner confirms it is set in Railway staging; later worker provisioning must install it in the worker runtime |
| `DOVERUNNER_SITE_KEY`, `DOVERUNNER_ACCESS_KEY` | Server-side licence token generation | Owner confirms both are set in the Railway staging dashboard |
| `DOVERUNNER_SITE_ID` | Server DRM adapter; `GXIW` | Installed without deployment and verified present by name on 2026-09-16 |
| `SALAD_API_KEY` | Server dispatch/control adapter | Owner confirms it is set in the Railway staging dashboard |
| `SALAD_ORGANIZATION_NAME`, `SALAD_PROJECT_NAME` | Server Salad API scope | Owner confirms both are set in Railway staging for organization `hrizonmedia` and project `hrizonmedia-staging` |

CloudFront public key `K3C8Y1YFXKCO19` belongs to key group
`d3876259-cc9f-4b5e-a55a-f8eaa1691f2e`. The owner reports that the default cache
behavior trusts this key group, the origin uses recommended private S3 access, and
the generated bucket policy names the CloudFront service and distribution. The
matching private key was installed directly in Railway and remains outside Git.
Actual signed manifest and segment requests, expiry and revocation are unverified.

The Railway CLI view used during the 2026-09-16 review did not enumerate every
provider variable visible to the owner in the dashboard. The owner dashboard
confirmation is the access-handoff evidence for issue #42; later real-adapter
connectivity tests, rather than secret-value inspection, must prove the values.

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

## Resolved compatibility decisions

Canonical interfaces: [StorageProvider, TranscodeProvider, DeliveryProvider and DrmProvider](../../web/src/media/providers/contracts.ts).
The integration decisions below preserve those interfaces. Detailed algorithms,
provider facts and citations are in [the provider-contract research](issue42-provider-research.md).
They are implementation contracts, not claims that the real adapters have passed
staging acceptance.

| Boundary | Required behavior | Resolution for the real adapter |
| --- | --- | --- |
| Storage / multipart | Stable provider upload ID; part receipts with size, ETag and SHA-256; resume and completion verification | Persist an app-ID-to-S3-upload mapping; sign the checksum header; retain size, ETag and SHA-256; exhaust `ListParts` pagination; compare a fresh provider listing before completion |
| Storage / probe | Server-verified media size, MIME type, dimensions and duration before queueing | A trusted worker privately reads the object and runs bounded `ffprobe`; `HeadObject` and browser metadata are not treated as a media probe |
| Transcode / queue and status | Stable app idempotency key, branded job ID, processing/ready status and permanent/transient errors | Persist dispatch intent, store the Salad UUID, use an atomic app lease to make duplicate native jobs harmless, and mark ready only after canonical encrypted outputs pass verification |
| Transcode / retries and deletion | Three total attempts, leased jobs and no output recreation after deletion | Persist a three-attempt app budget; after the third failure return success to suppress a deliberate fourth Salad attempt; tombstone before cancellation and make late work/callbacks no-ops plus cleanup |
| Callback | Signed, replay-bound, exact logical output prefix | Terminate native Svix webhooks at a separate verified/deduplicated translator and reconcile by polling; only the translated domain event reaches the existing transition logic |
| Delivery | Asset-scoped manifests AND segments, temporary access, immediate revocation | Keep the existing two-hour-five-minute backend delivery token, but exchange it through an authenticated refresh route for rolling 60-second custom-policy CloudFront cookies scoped to one output prefix. Deletion blocks refresh immediately and triggers S3 deletion/invalidation; residual edge access is bounded to 60 seconds plus an in-progress response |
| DRM | Distinct Content ID, backend check before every licence, five-minute start grant and temporary streaming | Use DoveRunner's token-proxy flow for the exact `drm_${processingJobId}`: reauthorize every backend acquisition, generate a 300-second provider token server-side, forward the challenge, and return the raw licence. Use policy v2 with `persistent:false` and `license_duration:0` so an acquired nonpersistent session may finish |
| Production | Real adapters verified; no fake providers or eSaral infrastructure reuse | Require dedicated production AWS resources and DoveRunner site/credentials, rotate or revoke reference credentials in coordination with eSaral, and keep the existing production feature gate until later real-provider verification passes |

Existing retention contracts remain: raw source cleanup 24 hours after successful
processing or 48 hours after failure; encrypted outputs expire seven days after
readiness. Admin must confirm versioning, Object Lock, encryption/KMS permissions
and lifecycle rules allow this without deleting other applications' objects.

## Before issue #42 can be completed

- [x] Providers and owner-supplied staging locations named.
- [x] Official operation documentation and public support routes linked.
- [x] Sandbox endpoints, regions, path rules, callback URLs and public support routes recorded without secrets.
- [x] Provider-neutral interface mappings are explicit and backed by primary sources.
- [x] Required AWS, CloudFront and Salad credentials installed directly in Railway
  staging without exposing values; DoveRunner staging credentials are also recorded
  for the parent DRM flow.
- [x] Provider cost components, public limits, two-job application concurrency and
  required dedicated production settings documented. Account quotas, live hardware
  rates, budgets and paid support SLAs remain operational provisioning inputs.
- [x] Every provider-neutral interface mismatch explicitly resolved, including the
  rolling 60-second CDN cookie and nonpersistent DoveRunner session behavior.

Real browser multipart, signed delivery, retry/cancellation, package-and-play and
performance checks gate activation of the later real adapters. They are not
evidence that can be produced by this provider-selection handoff alone.

After real adapters are implemented, use the parent issue's pre-agreed route/Payload
and Playwright seams, then Railway security/performance verification. Prove private
delivery, cross-member denial, callback integrity/replay, retries, deletion/retention,
five-minute grant semantics and Chrome/Edge Widevine playback. FairPlay and
PlayReady require separate verification before Multi-DRM marketing claims ship.
