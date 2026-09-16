# Issue #43: private storage and CDN delivery

Implementation base: `6e4f7d81b1a1c17e75a47143314092479102a63d` (`origin/master`).

The application selects the AWS adapters only when the complete `VIDEO_*` variable
set is present. S3 owns checksummed multipart creation, ten-minute part URL renewal,
paginated resume receipts, verified completion, private `ffprobe` inspection, abort,
exact source deletion, and safe output-prefix deletion. Each opaque application
provider ID has separately persisted provider state containing the native upload ID
and immutable source contract, so resume survives web-process restarts without
exposing the native identity as the domain ID.

CloudFront uses a custom policy scoped to one `processingJobId` output prefix. Each
signature lasts at most 60 seconds. The Shaka request filter propagates the current
policy only to same-origin resources below that prefix, and refreshes it through the
authenticated, owner-checked delivery endpoint. Deletion/expiry prevents a new
signature immediately; a previously issued URL remains bounded by the accepted
60-second edge window.

Object paths are:

- `sources/{uploadSessionId}/source.mp4|mkv` in the private S3 bucket;
- `outputs/{processingJobId}/...` in S3;
- `/{processingJobId}/...` through the CloudFront distribution whose origin path is
  `/outputs`.

Local contract coverage uses injected AWS command clients and real CloudFront RSA
signing. The suite verifies private multipart creation, signed checksummed parts,
pagination, receipt mismatch rejection, completion/HEAD verification, idempotent
abort, exact deletion, prefix deletion, 60-second asset scoping, and fail-closed
provider selection. Existing Payload tests continue to cover ownership, resume,
expiry, playback grants, and lifecycle cleanup.

Live Railway/S3/CloudFront acceptance must be recorded without credential values.
Before closing the issue, capture: real browser multipart/resume/abort; direct S3 and
unsigned CloudFront 403s; cross-member denial; repeated signature rotation during
playback; source/output deletion; required response content types/cache headers; and
the exact passing staging test command/commit. Issues #44 and #45 still own real
transcoding/package output and DoveRunner/Widevine verification respectively.
