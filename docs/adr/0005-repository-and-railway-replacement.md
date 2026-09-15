# Preserve code history and isolate staging data

Issue #29 approves replacing the marketing application while preserving its Git history through the annotated `pre-mvp-marketing-site-2026-09-13` tag and archive branch. Retain the existing Railway project, domain and connections; staging uses separate PostgreSQL and private CMS storage, while any production data reset requires a separately confirmed cutover. Git archives recover code, not database rows or bucket objects.
