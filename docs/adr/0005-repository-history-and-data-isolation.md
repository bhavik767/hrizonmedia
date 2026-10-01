# Preserve code history and isolate staging data

Issue #29 approves replacing the marketing application while preserving its Git history through the annotated `pre-mvp-marketing-site-2026-09-13` tag and archive branch. Staging uses separate PostgreSQL and private CMS storage. Any production data reset requires a separately confirmed cutover. Git archives recover code, not database rows or bucket objects.
