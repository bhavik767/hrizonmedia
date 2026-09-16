# Issue #42 provider-contract research

Research date: 2026-09-16  
Scope: contract decisions for the selected S3, CloudFront, SaladCloud and
DoveRunner staging providers. This note does not claim that the real adapters or
the selected accounts have passed end-to-end verification.

Only provider-owned documentation, AWS documentation, and the FFmpeg project
documentation are used below. Statements labelled **decision** are HrizonMedia
integration decisions derived from those sources, not provider promises.

## Decision summary

| Boundary | Decision for the real adapter |
| --- | --- |
| S3 multipart identity | Return an app-generated `provider_upload_*` ID and persist its mapping to the native S3 upload ID, exact bucket, exact `sources/` key and `SHA256` checksum algorithm. Never expose or parse the native upload ID as an app identifier. |
| S3 part receipt | Presign `UploadPart` with `x-amz-checksum-sha256`; require the browser to send the Base64 SHA-256 and retain `{partNumber, size, ETag, ChecksumSHA256}`. Paginate every `ListParts` response until `IsTruncated=false`. |
| Trusted media probe | Treat `HeadObject` as size/type/integrity metadata only. A trusted server-side worker must read the private object and run `ffprobe`; browser-reported dimensions and duration are advisory and must not be persisted as verified values. |
| Salad dispatch | Use a dedicated Job Queue and container group. The app processing-job ID is the idempotency key; the returned Salad UUID is the provider job ID. An atomic app-owned lease prevents duplicate work because Salad does not document a create-job idempotency key. |
| Salad attempts | Permit at most three expensive work attempts. Attempts one and two may fail to Salad; on the third terminal failure the worker records failure and returns success so Salad does not intentionally schedule its documented fourth attempt. A redelivery after interruption sees the exhausted attempt budget and exits without work. |
| Salad callbacks | Do not send Salad webhooks to the existing `x-hrizon-*` receiver. Add a separate Svix-verifying ingress/translator, dedupe on `webhook-id`, and invoke the domain transition internally. Poll `Get Job` as reconciliation because the official docs do not state a webhook delivery retry schedule. |
| Delete/cancel | Persist a deletion tombstone and revoke the lease first, request Salad cancellation second, and remove canonical plus per-attempt output prefixes. Workers check the tombstone before work and before publishing, so an accepted-but-not-yet-effective cancellation or late callback cannot recreate outputs. |
| CloudFront access | Keep the existing delivery authorization valid for the maximum two-hour asset plus its five-minute start window, but make CloudFront access a rolling asset-prefix custom-policy signed cookie with a recommended 60-second TTL. An authenticated backend refresh route rechecks the long-lived delivery token and current asset before issuing each cookie; the cookie covers the manifest and segments under only that asset prefix. |
| CloudFront revocation | Define `revokeAsset` as: deny new app grants and cookie refreshes immediately, delete the S3 asset prefix, and submit/wait for CloudFront invalidation. Do **not** claim instantaneous revocation of a cookie already issued: residual edge access is bounded by the 60-second cookie TTL plus completion of a request already in progress. |
| DoveRunner packaging | Use the CLI packager's DASH path for the initial Chrome/Edge Widevine proof. Use the existing immutable `drm_${processingJobId}` as the unique packaging/licensing Content ID, deterministic alphanumeric scratch filenames, and at least twice the input size as scratch space. |
| DoveRunner licensing | Use DoveRunner token-proxy integration, not direct client token delivery or the deprecated callback. `DrmProvider.acquireTemporaryLicence` receives the browser challenge after the backend has rechecked entitlement, creates a token for the exact Content ID, forwards token plus challenge to DoveRunner, and returns the raw licence bytes. Use `response_format=original`. |
| Temporary streaming licence | Use policy v2 with `persistent:false` and `license_duration:0`. The five minutes limits when playback may start/acquire a licence; the issued nonpersistent streaming licence may finish the viewing session and cannot be retained for offline playback. |
| Pilot capacity | Dedicated staging queue/group; one job at a time per replica; autoscaling minimum 0, maximum 2. Discover current eligible GPU classes, live availability and rate at provisioning time; benchmark the 15-minute readiness target instead of freezing a historical GPU/rate. |

## AWS S3: multipart and trusted probing

### Native facts

S3 assigns a unique native upload ID at multipart initiation, and that ID is
required for uploading, listing, completing and aborting parts. With additional
checksums enabled, an uploaded part returns both an ETag and its checksum. S3's
own SHA-256 tutorial starts the upload with `checksum-algorithm SHA256` and shows
`ChecksumSHA256` on each part response. It also requires consecutive part
numbers for additional-checksum completion. ([AWS multipart overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html),
[AWS SHA-256 multipart tutorial](https://docs.aws.amazon.com/AmazonS3/latest/userguide/tutorial-s3-mpu-additional-checksums.html))

`ListParts` can be truncated. The adapter must continue with
`NextPartNumberMarker` as `part-number-marker`; each listed part includes its
number, ETag and size, and the API schema includes the additional checksum
fields. ([AWS ListParts API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListParts.html))

A multipart ETag is not a whole-object content hash. AWS explicitly describes
the multipart ETag construction and exposes separately typed full-object or
composite checksums. ([AWS object-integrity guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html))

`HeadObject` returns metadata only. It can verify content length, declared
content type and a stored checksum, but it does not inspect a media container or
produce trusted dimensions/duration. ([AWS HeadObject API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html))
FFmpeg's `ffprobe` is designed to show container-format and stream information,
including selected stream entries. ([official ffprobe documentation](https://ffmpeg.org/ffprobe.html))

### Contract resolution

1. `initiateMultipart` allocates the source key and app-branded provider ID in
   one transaction, then creates an S3 multipart upload using `SHA256`. The
   mapping record is authoritative; subsequent calls reject any upload whose
   stored bucket/key/session ownership does not match.
2. `createPartUploadTarget` signs the exact bucket, key, native upload ID, part
   number and checksum header. Prefix and part-number checks occur before
   signing. The browser computes SHA-256 and sends the signed header.
3. `listParts` exhausts pagination and translates S3 output into the complete
   app receipt type. A missing checksum is an integrity error, not an empty
   checksum.
4. `completeMultipart` compares the caller's ordered receipts to a fresh,
   fully-paginated S3 listing before completion. It rejects gaps, duplicates,
   unexpected ETags/sizes/checksums and any size outside the upload-session
   contract. A successful `HeadObject` must confirm final size and a stored
   checksum; the ETag is never used as the content digest.
5. `probe` performs a trusted read of the private object and invokes `ffprobe`
   with bounded execution/output. It requires exactly one supported video
   stream, derives width/height/duration from parsed probe output, uses the
   verified object size, and accepts only the MP4/MKV container/MIME allowlist.
   The staging implementation may run this preflight in the application worker;
   production may move it to a dedicated trusted probe job without changing the
   `StorageProvider.probe` contract.

Account evidence still required: a real browser upload must prove the CORS
exposure of ETag/checksum headers, all IAM operations, pagination, completion,
abort, and private `GetObject` for the probe principal.

## CloudFront: asset scope and revocation boundary

AWS recommends signed cookies when one authorization must cover multiple files,
such as all files in an HLS/video set. A custom cookie policy supports wildcard
resources. AWS also recommends the most precise cookie domain, session cookies,
the `Secure` attribute and the shortest reasonable expiry. ([signed URL versus
cookie guidance](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-choosing-signed-urls-cookies.html),
[signed-cookie behavior and safeguards](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-cookies.html),
[custom-policy resource syntax](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-setting-signed-cookie-custom-policy.html))

The distribution must require a trusted key group on the output behavior, and
the S3 origin must use Origin Access Control with all other direct read access
removed. ([AWS trusted signers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html),
[private content and OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-overview.html))

CloudFront checks credential expiry for each HTTP request, but a response that
begins before expiry can finish afterward. Configuration changes do not reach
all edge locations simultaneously, and invalidation has an in-progress state.
([signed-cookie expiry behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-cookies.html),
[CloudFront configuration propagation](https://docs.aws.amazon.com/pdfs/AmazonCloudFront/latest/DeveloperGuide/AmazonCloudFront_DevGuide.pdf),
[CloudFront invalidations](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation_Requests.html))

The existing application deliberately keeps its delivery token valid for two
hours and five minutes so a video that starts inside the five-minute playback
grant can continue to its maximum two-hour duration. A CloudFront cookie with
that lifetime would make revocation too weak, while a five-minute cookie could
still break a long playback after expiry. **Decision:** keep the long-lived
delivery token as a backend-validated bearer and exchange it through
an authenticated refresh route for an asset-prefix CloudFront cookie with a
recommended 60-second TTL. Every refresh revalidates the delivery token, stored
grant, ownership, current asset state and expiry. The player refreshes before
cookie expiry; the unsigned manifest and segment URLs remain stable.

This rolling-cookie route may need to be added during real-adapter
implementation, but it does not require changing the `DeliveryProvider`
`authorize` signature: `authorize` still accepts the long delivery expiry/token
and returns the manifest URL/authorization expiry, while the HTTP integration
owns initial cookie issuance and refresh.

The provider still cannot promise per-grant instantaneous edge revocation.
`revokeAsset` must stop new grants and cookie refresh immediately, delete the S3
asset prefix, and submit/wait for CloudFront invalidation. A cookie already
issued can authorize new requests only until its at-most-60-second expiry, and
a response begun before expiry may finish afterward. Removing a signing key is
an account-wide emergency operation, not normal per-asset revocation.

Verification still required: unsigned manifest and segment requests return
403; the cookie grants only one processing prefix; `sources/` is unreachable;
the refresh route rejects cross-member, deleted, expired and mismatched assets;
continuous playback survives multiple cookie rotations; stopping refresh
denies new manifest/range requests within 60 seconds; direct S3 reads fail; and
asset deletion/invalidation reach `Completed`.

## SaladCloud: queue, attempts, callbacks and cleanup

### Provider facts

Salad Job Queues deliver work to an HTTP server. HTTP success/failure semantics
drive the queue; a failed job is retried up to three times (four total attempts),
interruptions count as failures, execution order and node affinity are not
guaranteed, and a response body is limited to 10 MB. ([Salad Job Queue
semantics](https://docs.salad.com/container-engine/explanation/job-processing/job-queues))

Create Job accepts arbitrary JSON input, metadata and an optional webhook, then
returns a generated UUID and one of `pending`, `running`, `succeeded`,
`cancelled` or `failed`. The official request schema documents no idempotency
key/header. Get Job exposes those states for reconciliation. ([Create Job](https://docs.salad.com/reference/saladcloud-api/queues/create-job),
[Get Job](https://docs.salad.com/reference/saladcloud-api/queues/get-job))

Salad signs queue webhooks using Svix and the `webhook-signature`, `webhook-id`
and `webhook-timestamp` headers. Those are not the existing HrizonMedia callback
headers. ([Salad webhook-signature guide](https://docs.salad.com/container-engine/how-to-guides/job-processing/webhook-signature))
The queue DELETE operation is documented as cancellation and returns 202,
which is acceptance rather than proof that work has stopped. ([Delete Job](https://docs.salad.com/reference/saladcloud-api/queues/delete-job))

Organization quota counts configured replicas even for stopped groups, and an
autoscaler's maximum counts toward quota. A group is capped at 500, but the
actual organization quota is account-specific. ([Salad quotas](https://docs.salad.com/container-engine/reference/quotas))
The public API limit is 240 requests/minute per key. ([Salad API usage](https://docs.salad.com/reference/api-usage))
A container group can attach to one queue, while a queue can feed multiple
groups; Salad recommends startup/readiness probes so jobs are not delivered
before the application is ready. ([creating a Job Queue](https://docs.salad.com/container-engine/how-to-guides/job-processing/creating-a-job-queue))

### Contract resolution

- Use a dedicated staging queue and group. Embed `processingJobId` in both input
  and metadata, store the returned Salad UUID as `providerJobId`, and do not
  treat metadata as provider deduplication.
- The worker acquires an atomic lease keyed by `processingJobId` and attempt.
  Only the lease holder may download, transcode/package, or publish. Outputs are
  written first to an attempt-specific prefix and promoted/published to the
  canonical exact `outputs/{processingJobId}/` prefix only after every expected
  encrypted manifest/segment passes verification.
- The app persists a maximum of three expensive attempts. On terminal attempt
  three it commits the app failure before responding 2xx to Salad. Any fourth
  delivery caused by provider retry/interruption observes exhausted state and
  returns 2xx without processing. Do not add another adapter retry loop around
  Salad's work delivery.
- Map `pending` and `running` to app `processing`. Map `succeeded` to `ready`
  only after canonical-output verification. Treat `cancelled` as permanent and
  `failed` as permanent once the app attempt budget is exhausted. Network
  timeouts, 429 and 5xx during control-plane calls are transient and reconciled
  with bounded exponential backoff; schema/auth/not-found after reconciliation
  is permanent/operator-visible.
- Because POST outcome may be uncertain, the dispatcher records intent before
  calling Salad. Reconciliation searches the stored native ID when present and
  relies on the processing lease to make duplicate native jobs harmless when no
  ID was received.
- Add a distinct `/api/internal/salad/webhook`-style ingress. It verifies the
  raw Svix body, dedupes `webhook-id`, validates the known Salad job and expected
  output prefix, translates provider state, then calls the same internal domain
  transition used by polling. Native payloads never bypass domain validation.
- Deletion writes the tombstone/revokes the lease before calling DELETE, then
  deletes attempt and canonical prefixes. Every worker checks the tombstone
  before compute and before publication; every late callback becomes a no-op
  plus cleanup.

### Capacity and cost contract

For staging set worker concurrency to one per replica and autoscaling minimum 0,
maximum 2, so provider concurrency cannot exceed the app's two-job default.
Scale-to-zero avoids idle compute but introduces cold starts. Salad documents
both bounds and warns that downscaling can remove nodes that are still working,
so graceful shutdown and leases/checkpoints are required. ([autoscaling
settings](https://docs.salad.com/container-engine/reference/autoscaling/settings))

Billing is per second while instances are running, based on selected hardware
and priority. ([Salad billing](https://docs.salad.com/container-engine/explanation/billing-pricing/billing))
Current GPU classes/rates and live capacity are organization-scoped API data,
not durable documentation values. Select a tested class set with sufficient
VRAM at provisioning, query availability for any country restriction, then
benchmark the required 15-minute readiness target. ([list GPU classes](https://docs.salad.com/reference/saladcloud-api/organizations/list-gpu-classes),
[GPU availability](https://docs.salad.com/reference/saladcloud-api/organizations/get-gpu-availability))

Account evidence still required: exact organization/project/queue/group names,
actual replica quota, selected hardware and countries, live hourly rate,
worker-secret installation, and a real interruption/retry/cancel/late-callback
test. Provider docs do not publish a queue-webhook retry timetable, so polling
reconciliation is a deliberate permanent requirement.

## DoveRunner: packaging identity and temporary licensing

DoveRunner requires encryption packaging before licence issuance. Its CLI
packager supports DASH and takes an encryption token and Content ID; the same
unique Content ID is used again in the licence token. The multi-key guide also
documents DASH/Widevine packaging and deterministic manifest outputs. ([content
packaging overview](https://docs.doverunner.com/content-security/multi-drm/packaging/),
[DoveRunner CLI packager](https://docs.doverunner.com/content-security/multi-drm/packaging/cli-packager/),
[multi-key packaging guide](https://docs.doverunner.com/content-security/multi-drm/advanced-guides/multikey-guide/))

DoveRunner supports token and token-proxy issuance and deprecates the legacy
callback form. In token-proxy flow, the client sends its DRM challenge to the
service backend; the backend authenticates/authorizes the viewer, creates a
token containing Content ID and policy, forwards challenge plus token to
DoveRunner, and returns DoveRunner's licence response to the client. The
default provider-token validity is 600 seconds and is adjustable in the
console. Token validity controls when a licence can be acquired; it is separate
from how long an issued licence permits playback. ([DoveRunner licence token
guide](https://docs.doverunner.com/content-security/multi-drm/license/license-token/))

For streaming, `persistent:false` is the non-offline mode. DoveRunner documents
`license_duration:0` as unlimited and specifically recommends a nonpersistent,
default-duration licence for finite VOD because rights are checked anew when
playback starts. It also warns that expiry during playback can be hard or soft
depending on client/OS, so a five-minute licence duration would not reliably
mean "start within five minutes, then finish the video." ([DoveRunner playback
policy and streaming guidance](https://docs.doverunner.com/content-security/multi-drm/license/license-token/))

The resulting contract is:

1. Packaging uses Content ID `drm_${processingJobId}` and stores it on the media
   asset. The worker holds only `DOVERUNNER_ENC_TOKEN`; site/access keys used to
   generate licence tokens remain only on the application backend.
2. The first supported output is DASH CENC for Chrome/Edge Widevine. FairPlay
   and PlayReady remain explicitly unclaimed until their prerequisites and
   separate playback tests pass.
3. Every licence request reaches the HrizonMedia backend first through the
   existing application licence route. It authenticates the member, validates
   the five-minute playback-grant token, reloads the playback grant/asset, and
   checks current entitlement and revocation before calling
   `DrmProvider.acquireTemporaryLicence` with the browser's challenge and exact
   Content ID.
4. Configure the DoveRunner site token duration to 300 seconds. Use
   `response_format=original` and policy
   `{ "policy_version": 2, "playback_policy": { "persistent": false,
   "license_duration": 0 } }`. The provider adapter generates this token just
   in time, sends it as `pallycon-customdata-v2` with the challenge to
   DoveRunner's documented licence endpoint, and returns the raw licence bytes
   to the application route. Provider tokens and site/access keys never reach
   the browser.
5. A revoked entitlement blocks every new backend token request immediately.
   The application playback-grant token, not a client-held DoveRunner token,
   enforces the five-minute start window. A licence already acquired may finish
   the current nonpersistent streaming session. This is the accepted
   "temporary streaming" behavior and is not immediate midstream termination.

Account evidence still required: the shared staging Site ID, encryption token,
site/access keys and packaged Content ID must be proven mutually compatible by
a real package-and-play test; the console must show a 300-second token duration;
and current plan/licence limits must be recorded. Shared eSaral credentials/site
remain disallowed for production unless the production exception is separately
accepted.

## Remaining non-documentary acceptance inputs

The provider contracts above are now explicit. The following cannot be proved
from public documentation and therefore remain owner/account or staging-test
evidence rather than interface-design questions:

- the actual Salad organization quota, chosen GPU availability/rate, and
  end-to-end processing benchmark;
- a numeric monthly/all-in spending ceiling and alert recipients (AWS budgets
  and provider balance alerts monitor spend but do not substitute for an owner
  ceiling);
- presence of every required Railway and Salad worker secret, checked only by
  name/connectivity without printing values;
- an account-specific escalation contact or purchased support SLA beyond the
  public [AWS Support Center](https://console.aws.amazon.com/support/home),
  [Salad support](https://docs.salad.com/support), and
  [DoveRunner Help Center](https://support.doverunner.com/hc/en-us/requests/new);
- the real multipart, private delivery, Salad retry/cancel, DoveRunner licence
  and Chrome/Edge Widevine acceptance runs described above.

These items should gate activation of real staging adapters. They do not require
further provider-interface redesign.
