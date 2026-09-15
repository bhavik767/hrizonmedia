# Railway staging deployment

Issue #41 prepares the complete deterministic MVP for isolated staging. Configure
the Railway web service root directory as `/web` and config file path as
`/web/railway.json`. The checked-in configuration selects the Dockerfile, one
continuously awake replica (required by process-local fake storage and rate limits),
`/health`, a 180-second readiness window, and at most three failure restarts.
See [Railway config-as-code](https://docs.railway.com/config-as-code/reference).

Create/select an environment named exactly `staging`. Use a separate staging
PostgreSQL service and private CMS bucket, not references to production resources.
Provide the variables below, `NEXT_PUBLIC_SERVER_URL` as the staging HTTPS origin
at both build and runtime, `HRIZONMEDIA_DEMO_ENABLED=true`, and independent staging
secrets. Railway supplies `RAILWAY_ENVIRONMENT_NAME=staging`. Never duplicate
production data or run the old template seed/reset scripts.

Deploy this branch using the connected GitHub source or authenticated Railway CLI
from `web`: `railway up --environment staging --service <staging-web-service>`.
Confirm the linked project/service first. Do not change the production source branch,
domain or variables. Keep `HRIZONMEDIA_DEMO_ENABLED` unset or `false` there.

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

Fake source/upload bytes live in memory and disappear on restart. Use only disposable
fixtures; restart/redeploy requires fresh uploads, and stored records are not proof
that the fake provider still has their source bytes. No real DRM or performance
certification is implied by a passing deterministic demonstration.

## Deployed acceptance checks

Use a dedicated disposable staging test environment: browser fixture helpers delete
Pilot Members, Media Assets, jobs, grants and Audit Events in the selected database.
Do not run them on a staging environment holding a live pilot demonstration.
Export its public PostgreSQL `DATABASE_URL`, matching `PAYLOAD_SECRET`, staging
`NEXT_PUBLIC_SERVER_URL`, `RAILWAY_ENVIRONMENT_NAME=staging`,
`HRIZONMEDIA_DEMO_ENABLED=true`, `NODE_ENV=production` and
`HRIZONMEDIA_STAGING_TESTS=true` into the test runner without committing values.
Run `npm run test:staging` from `web`; it uses the deployed origin and starts no
local server. Install Playwright Chromium, Chrome and Edge first. The existing suite
covers invitations/sign-in, multipart upload/resume, ownership, processing/retry,
playback contracts/controls/watermark, deletion/expiry and brand/keyboard/contrast.
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
