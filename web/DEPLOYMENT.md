# Hetzner deployment

Hetzner is the only active application deployment target. The public origin is
`https://wecloud.biz`; Caddy terminates TLS and proxies to the Next.js/Payload
container on the private Compose network. A dedicated scheduler container calls
Payload's authenticated media queue endpoint every ten seconds; the app disables
its in-process runner when that external scheduler is present.

## Server layout

The checked-in deployment files mirror the live stack:

| Path                                | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| `/srv/wecloud/app`                  | Shallow Git checkout used for builds              |
| `/srv/wecloud/config/internal.env`  | Database and application secrets                  |
| `/srv/wecloud/config/providers.env` | Storage, Salad, CloudFront and DoveRunner secrets |
| `/srv/wecloud/config/Caddyfile`     | Public HTTPS reverse proxy configuration          |
| `/srv/wecloud/compose.yaml`         | Deployed copy of `web/deploy/compose.yaml`        |

Never commit or print either env file. Inspect variable names only when auditing
configuration. The application exposes `/health`; PostgreSQL is not published to
the internet, and the app port binds only to `127.0.0.1:3000` for host diagnostics.

## Build and deploy

Deploy an explicit Git commit and use its short SHA as an immutable local image tag:

```sh
cd /srv/wecloud/app
git fetch --prune origin
git checkout --detach <full-commit-sha>
revision="$(git rev-parse --short=7 HEAD)"
docker build \
  --build-arg NEXT_PUBLIC_SERVER_URL=https://wecloud.biz \
  --tag "wecloud-web:${revision}" \
  web
install -m 0644 web/deploy/compose.yaml /srv/wecloud/compose.yaml
install -m 0644 web/deploy/Caddyfile /srv/wecloud/config/Caddyfile
printf 'WECLOUD_WEB_IMAGE=wecloud-web:%s\n' "${revision}" \
  > /srv/wecloud/config/deploy.env
docker compose --env-file /srv/wecloud/config/deploy.env \
  -f /srv/wecloud/compose.yaml --profile public up -d
curl --fail --silent --show-error http://127.0.0.1:3000/health
curl --fail --silent --show-error https://wecloud.biz/health
```

`src/config/validate-environment.mjs` blocks startup when required production
configuration is missing. The real-media configuration is loaded from
`providers.env`; `DEPLOYMENT_ENVIRONMENT=staging` is reserved for an isolated
stack that intentionally uses deterministic fake media providers.

## Verify and roll back

After deployment, confirm PostgreSQL, app, scheduler, and proxy are running,
`/health` returns HTTP 200 locally and publicly, and the application logs show
successful `media_cycle_completed` events. Exercise one upload through processing
and playback before declaring a media change complete.

To roll back, put the last known-good immutable tag in `deploy.env` and run the
same `docker compose ... up -d` command. Do not delete the previous image until
the replacement has passed health and media-flow checks. Database migrations must
remain backward compatible with the prior image; take and test PostgreSQL backups
before any irreversible schema or data migration.
