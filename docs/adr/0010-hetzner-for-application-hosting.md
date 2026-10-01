# Hetzner for application hosting

> Status: accepted and operational. See [`web/DEPLOYMENT.md`](../../web/DEPLOYMENT.md).

WeCloud deploys its Next.js/Payload application and supporting services on Hetzner. The production stack uses Docker Compose under `/srv/wecloud`, PostgreSQL 16, and Caddy TLS termination for `wecloud.biz`. Secrets remain outside Git, images use immutable commit tags, and every rollout must verify local and public health plus the media-processing cycle. The previous image is retained for rollback, and irreversible database changes require a tested backup.
