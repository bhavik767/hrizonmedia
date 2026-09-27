# Hetzner deployment

Hetzner is the deployment target for the WeCloud application. Railway is no longer used for active staging or production deployment; its remaining configuration and historical evidence must not be treated as an operational runbook.

The application is built from `web/Dockerfile`, exposes its readiness endpoint at `/health`, and requires the production environment variables validated by `src/config/validate-environment.mjs`. Keep all environment-specific secrets outside Git. A successful merge does not deploy by itself until a Hetzner deployment pipeline is configured to do so.

Before enabling automatic deployment, verify the target environment has isolated PostgreSQL and private object storage, database migrations are applied safely, `/health` is monitored, backups and rollback are tested, and the deployment only exposes the intended HTTPS origin.
