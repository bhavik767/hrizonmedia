# Railway baseline

Railway builds `web/Dockerfile` and starts the standalone Next.js/Payload server on
`0.0.0.0:$PORT`. Configure the service health-check path as `/health`.

Production startup requires `DATABASE_URL`, `PAYLOAD_SECRET`, `BUCKET`,
`ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, and `ENDPOINT`. `DATABASE_URL` must be a
PostgreSQL URL. `REGION` defaults to `auto`; set `AWS_S3_URL_STYLE=path` or
`S3_FORCE_PATH_STYLE=true` when the bucket endpoint needs path-style requests.

The public Demo navigation and `/demo` route are disabled unless
`HRIZONMEDIA_DEMO_ENABLED=true`. Keep the variable unset in production until the real
provider adapters pass their security, performance, and DRM verification.

Payload runs the committed migrations from `src/migrations` in production. CMS media
uses the private S3-compatible bucket and signed downloads; local development keeps
using `public/media` when the bucket variables are absent.

Issue #30 establishes deployment plumbing only. It does not authorize changing Railway
PostgreSQL rows, bucket objects, domains, or production variables.
