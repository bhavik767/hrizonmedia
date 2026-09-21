# Railway staging deployment

Issue #41 prepares the complete deterministic MVP for isolated staging. Configure
the connected GitHub web service root directory as `/web`. The staging infrastructure
definition is `web/.railway/railway.ts`; it refuses to plan/apply against production
and preserves existing secret values on Railway. Run `railway config plan` and then
`railway config apply` from `web` while linked to `staging`. Inspect the plan first.
The checked-in configuration selects the Dockerfile, one
continuously awake replica (required by process-local fake storage and rate limits),
`/health`, a 180-second readiness window, and at most three failure restarts.
See [Railway infrastructure-as-code](https://docs.railway.com/infrastructure-as-code).
New services cannot select the deprecated `railway.json` format.

Create/select an environment named exactly `staging`. Use a separate staging
PostgreSQL service and private CMS bucket, not references to production resources.
Provide the variables below, `NEXT_PUBLIC_SERVER_URL` as the staging HTTPS origin
at both build and runtime, `HRIZONMEDIA_DEMO_ENABLED=true`, and independent staging
secrets. Railway supplies `RAILWAY_ENVIRONMENT_NAME=staging`. Never duplicate
production data or run the old template seed/reset scripts.

Deploy `fix/salad-staging-bootstrap` using the connected GitHub source or authenticated
Railway CLI from the repository root: `railway up . --path-as-root --project <project-id>
--environment staging --service <staging-web-service>`. This preserves `/web` in
the upload archive, matching the service root and watch patterns.
Confirm the linked project/service first. Do not change the production source branch,
domain or variables. Keep `HRIZONMEDIA_DEMO_ENABLED` unset or `false` there.

The staging deployment evidence records revision `e30ca97` on 15 September 2026.
That revision is an ancestor of `fix/salad-staging-bootstrap`. Railway's checked-in
configuration identifies the `staging` environment but does not record its GitHub
source-branch binding; confirm the connected branch in Railway before changing it.

## Readiness and operations

`/health` initializes Payload (including committed production migrations) and queries
PostgreSQL before returning an uncached 200. An unavailable database returns a
sanitized, uncached 503. Readiness does not certify real provider connectivity.
Payload's scheduled worker dispatches/reconciles every ten seconds without browser
traffic; sleeping or multiple staging replicas are unsupported.

Railway logs contain JSON diagnostics with `timestamp`, `level`, `event` and an
optional numeric `recordID`. Monitor `processing_stalled`, `source_cleanup_pending`,
`media_cleanup_pending`, `lifecycle_audit_pending`, `media_cycle_failed` and
`health_unavailable`; correlate record IDs with the operator console and Audit Events.
`media_cycle_completed` is the maintenance heartbeat. Alert on absent heartbeats
for one minute and on repeated pending cleanup; no raw exception or secret is logged
by these diagnostics. Inspect Railway process logs for startup failures as well.

When none of the `VIDEO_*` variables below are present, fake source/upload bytes live
in memory and disappear on restart. Use only disposable fixtures in that mode;
restart/redeploy requires fresh uploads, and stored records are not proof that the
fake provider still has their source bytes. No real DRM or performance certification
is implied by a passing deterministic demonstration.

## Private video storage and delivery

Issue #43 activates real S3 upload/storage and CloudFront delivery as one fail-closed
configuration. Set all of these variables in Railway staging; setting only some makes
the service refuse provider initialization instead of falling back to fake storage:

- `VIDEO_S3_ACCESS_KEY_ID`, `VIDEO_S3_SECRET_ACCESS_KEY`, `VIDEO_S3_BUCKET`, and
  `VIDEO_S3_REGION` belong only to the dedicated private video bucket.
- `VIDEO_CLOUDFRONT_DOMAIN`, `VIDEO_CLOUDFRONT_KEY_PAIR_ID`, and
  `VIDEO_CLOUDFRONT_PRIVATE_KEY` belong only to the output distribution/key group.
  A multiline PEM may be stored normally or with escaped `\n` separators.

Do not substitute the CMS `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, or `ENDPOINT`
variables. The browser uploads 5 MiB checksummed parts directly to presigned S3 URLs.
S3 CORS must allow `PUT` from the exact staging origin, allow the checksum request
header, and expose `ETag` plus `x-amz-checksum-sha256`. Bucket-level public access
blocking, ACL-disabled ownership, and CloudFront Origin Access Control remain required
account settings; the application never requests a public ACL.

Sources use `sources/{uploadSessionId}/source.mp4|mkv`. Encrypted outputs use
`outputs/{processingJobId}/`; because the distribution origin path is `/outputs`,
viewer URLs begin with `/{processingJobId}/`. CloudFront custom-policy URLs authorize
only that prefix for 60 seconds. The player obtains renewed signatures from the
authenticated application before expiry and copies them only to manifest/segment
requests under the same origin and prefix. Deletion blocks refresh immediately and
removes every object under the validated output prefix idempotently.

The runtime image includes `ffprobe`; completed private sources are streamed through
it for bounded server-side container, duration, and dimension verification before a
Processing Job is queued.

## Real transcoding

Issue #44 activates SaladCloud dispatch only when the storage/delivery variables
above and all of `SALAD_API_KEY`, `SALAD_ORGANIZATION_NAME`, `SALAD_PROJECT_NAME`,
`SALAD_QUEUE_NAME`, and `SALAD_WEBHOOK_SECRET` are present. Partial configuration
fails closed. The queue worker receives only the verified `sources/{uploadSessionId}`
key, canonical `outputs/{processingJobId}/` prefix, source probe, approved H.264/AAC
rendition ladder, and distinct DRM Content ID. Salad's native UUID is stored as the
Provider Job ID and reconciled by polling.

Configure the queue completion webhook as
`$NEXT_PUBLIC_SERVER_URL/api/internal/salad/webhook`. This ingress verifies Salad's
Svix `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers using
`SALAD_WEBHOOK_SECRET`, binds the signed job input to the known output prefix, and
deduplicates the event before applying a state transition. Failed native jobs consume
the application's three-attempt budget; a provider success becomes ready only after
S3 contains `manifest.mpd` and a matching, worker-written `completion.json` marker.
The existing `/api/internal/transcode/callback` remains the authenticated callback
contract for an application-owned worker/translator.

Follow the one-replica bootstrap and functional sentinel procedure in
[`transcoder/README.md`](transcoder/README.md) before allowing a new Salad group to
scale to zero. A created group or queue-membership response alone is not deployment
evidence.

## DoveRunner Widevine licensing

Issue #45 enables the real DRM adapter only with the complete provider set above
plus `DOVERUNNER_SITE_ID`, `DOVERUNNER_SITE_KEY`, and `DOVERUNNER_ACCESS_KEY` in
the staging web service. These values are server-only. Keep `DOVERUNNER_ENC_TOKEN`
only in the Salad worker, never in the web service or browser bundle. Partial
configuration fails closed rather than returning deterministic licences.

The application is a token proxy: it reauthorizes the uploader and the five-minute
Playback Grant before creating a DoveRunner token for one DRM Content ID, forwards
the browser challenge with `response_format=original`, and returns only raw licence
bytes. Provider tokens, site/access keys, and licence data must never be copied to
Railway logs or issue evidence. The policy disables persistent/offline licences and
allows an already-issued streaming session to finish. See
[`issue45-doverunner-drm-verification.md`](../docs/staging/issue45-doverunner-drm-verification.md)
for the required non-secret Chrome, Edge, FairPlay, and PlayReady evidence; do not
claim Multi-DRM until every listed verification passes.

## Deployed acceptance checks

Use a dedicated disposable staging test environment: browser fixture helpers delete
Pilot Members, Media Assets, jobs, grants and Audit Events in the selected database.
Do not run them on a staging environment holding a live pilot demonstration.
Open a temporary localhost-only SSH tunnel with a registered personal key:
`railway connect Postgres-RGHC --environment staging --tunnel-only --port 5439`.
Keep the tunnel open during testing; its connection details contain credentials
and must not be copied to logs or source. The database remains private.
Export `DATABASE_URL` using the staging credentials with host `127.0.0.1` and
port `5439`, matching `PAYLOAD_SECRET`, staging
`NEXT_PUBLIC_SERVER_URL`, `RAILWAY_ENVIRONMENT_NAME=staging`,
`HRIZONMEDIA_DEMO_ENABLED=true`, `NODE_ENV=production` and
`HRIZONMEDIA_STAGING_TESTS=true` into the test runner without committing values.
Run `npm run test:staging` from `web`; it uses the deployed origin and starts no
local server. Install Playwright Chromium, Chrome and Edge first. The existing suite
covers invitations/sign-in, multipart upload/resume, ownership, processing/retry,
playback contracts/controls/watermark, deletion/expiry and brand/keyboard/contrast.
The opt-in disables automatic maintenance in the fixture process only; never set
`HRIZONMEDIA_STAGING_TESTS` on the deployed web service.
Run `npm run test:int` separately against the disposable local database for hostile
callbacks, retention, provider contracts and production startup rejection.

Before declaring #41 complete, record the deployment URL and commit, Railway
readiness result, deployed browser report, brand screenshots, and maintenance/log
observations in the PR. Deployment and deployed checks remain pending until these
artifacts exist; the configuration alone does not satisfy live acceptance.

## Runtime baseline

Railway builds `web/Dockerfile` and starts the standalone Next.js/Payload server on
`0.0.0.0:$PORT`. Configure the service health-check path as `/health`.

Production startup requires `DATABASE_URL`, `PAYLOAD_SECRET`, `BUCKET`,
`ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT`, and `TRANSCODER_CALLBACK_SECRET`.
`DATABASE_URL` must be a PostgreSQL URL. `REGION` defaults to `auto`; set
`AWS_S3_URL_STYLE=path` or
`S3_FORCE_PATH_STYLE=true` when the bucket endpoint needs path-style requests.

`TRANSCODER_CALLBACK_SECRET` authenticates signed provider callbacks. Provider
concurrency defaults to `MEDIA_PROVIDER_CONCURRENCY=2` until an operator changes it in
the Demo oversight console; the persisted operator setting then takes precedence.

The public Demo navigation and `/demo` route are disabled unless
`HRIZONMEDIA_DEMO_ENABLED=true`. Keep the variable unset in production until the real
provider adapters pass their security, performance, and DRM verification.

Payload runs the committed migrations from `src/migrations` in production. CMS media
uses the private S3-compatible bucket and signed downloads; local development keeps
using `public/media` when the bucket variables are absent.

Production cutover and production data resets remain outside this staging deployment.
