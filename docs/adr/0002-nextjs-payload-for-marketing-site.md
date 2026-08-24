# Next.js with Payload for the marketing site

The marketing site is blog-led: its job is to publish enough articles to earn rankings
on a domain with no authority. We chose **Next.js with Payload CMS running inside the
same application**, self-hosted, rather than the faster static option — because browser-
based editing is required for non-developer authors, and owning the content
infrastructure outright was preferred over depending on a hosted CMS vendor.

## Considered Options

- **Astro + MDX** (articles as files in git) — fastest pages by a wide margin, roughly
  0 KB of JavaScript per article against ~90 KB for Next, zero hosting cost and almost
  no upkeep. Rejected because publishing would require developer tooling, making every
  article a code change.
- **Astro + Sanity** — same page speed with browser-based editing and no servers to run.
  Rejected in favour of owning the data and avoiding per-seat vendor pricing.
- **WordPress** — fastest to first article and the most mature SEO tooling. Rejected on
  security posture: it is the most-attacked CMS on the web, almost always through
  third-party plugins, and a compromised marketing site is an asymmetric reputational
  risk for a company selling anti-piracy.

## Consequences

- **Payload requires Next.js**, so this choice and the framework choice are one decision,
  not two. Astro was never combinable with Payload without running two frameworks.
- **Self-hosting is the only current path.** Payload Cloud is paused for new deployments
  following the Figma acquisition, so we operate the Node process, the database, backups,
  and an internet-facing admin panel. This is the same category of upkeep we rejected
  WordPress for, accepted here because the engineering underneath is materially better
  and the plugin attack surface does not exist.
- **Article pages must be statically generated or incrementally cached.** The page-weight
  penalty is tolerable; a database query on every article request would not be.
- **Two backends now exist** — Payload and the pre-existing video platform backend. The
  boundary between them needs to be explicit or it will rot, and deserves its own ADR once
  decided. (This line originally pointed at ADR-0003; that number went to the theme
  decision instead.)
- The customer dashboard could live in this same application. Whether it should is a
  separate decision, and coupling marketing deploys to product deploys is a real cost.
