# Setup notes

This is Payload's official `website` template, with four deliberate deviations. They are
listed here because each one looks like a mistake if you don't know why it's there.

## 1. Template pulled from the `v3.88.0` tag, not `main`

The monorepo's `main` branch templates reference APIs that are not published yet
(`createFolderField`, for example), so scaffolding from HEAD produces a project that
cannot start. Always pull the template at the tag matching the published Payload version.

## 2. `workspace:*` versions pinned to `3.88.0`

Templates inside the monorepo reference sibling packages with pnpm's `workspace:*`
protocol, which npm cannot resolve. All twelve `@payloadcms/*` dependencies and `payload`
itself are pinned to a real published version. **When upgrading Payload, bump all of them
together** — they are released in lockstep and mixing versions breaks the admin bundle.

## 3. SQLite instead of MongoDB

The stock template ships `@payloadcms/db-mongodb`. This project uses
`@payloadcms/db-sqlite` so that local development needs no database server at all.

**This is a local-development choice.** Production uses Railway PostgreSQL. The config
selects PostgreSQL when `DATABASE_URL` is a Postgres connection string and otherwise falls
back to SQLite, so local development still needs no database server. Both adapters are
Drizzle-based and share migration tooling.

The database file is `web/encryptstream.db` and is disposable: delete it and restart to get
a clean instance.

Production uploads use a private Railway Storage Bucket. Payload issues signed download
URLs after applying collection access control; local development keeps using `public/media`.
See ADR-0004 for the hosting decision.

## 4. `engines.node` relaxed to `>=20.9.0`

The template declares `>=24.15.0`, which is the Payload monorepo's own development
requirement rather than a real constraint. Next 16 needs `>=20.9.0` and Payload needs
`^18.20.2 || >=20.9.0`.

Note that this machine runs **Node 23.9.0**, an odd-numbered, non-LTS release that falls
into a gap in several tooling packages' supported ranges (`^20.19 || ^22.12 || >=24`).
Everything runs, but `npm install` prints `EBADENGINE` warnings. Moving to Node 22 LTS or
24 LTS clears them.

## Running it

    cd web
    npm run dev        # http://localhost:3000

First visit to `/admin` prompts you to create the first admin user.

Regenerate Payload artefacts after changing collections:

    npm run generate:types
    npm run generate:importmap

## Visual baselines

`tests/e2e/visualBaselines.e2e.spec.ts` photographs an Article and the Article index in
both themes at a desktop and a phone width — eight full-page baselines, committed
alongside the spec in `tests/e2e/visualBaselines.e2e.spec.ts-snapshots/`.

They are rendered by this machine's Chromium, so they are only comparable to themselves.
A design change is expected to break them; that is the point. Redraw them with

    npm run test:e2e -- --update-snapshots visualBaselines

and then **look at every PNG that changed** before committing it. An updated baseline
nobody read is a regression nobody noticed.

The comparison is exact — `threshold: 0`, not Playwright's default of 0.2, which is wide
enough to pass a page whose ground has quietly drifted off the brand. If a baseline will
not hold still between runs, the page is doing something at an unpredictable moment and
that is the thing to fix. Widening the tolerance until it passes buys a test that cannot
fail, which is worse than having none.

## Seeding the articles

`scripts/seed-articles.ts` creates the ten planned launch articles plus their three
categories. It is idempotent — it skips any post whose slug already exists, so it is safe
to re-run after editing.

    npm run payload -- run scripts/seed-articles.ts

Each post is created published, with SEO title and description, a category, and a body
containing a real opening paragraph and the section headings to write into. **They are
working drafts, not finished articles.**

Two things to know if you write your own seed scripts:

- **Pass `context: { disableRevalidate: true }` on every create and update.** The template's
  `revalidatePost` hook calls Next's `revalidatePath`, which throws
  `Invariant: static generation store missing` when there is no request context. The
  template's own seed endpoint does the same thing.
- **Rich text is Lexical JSON**, not Markdown or HTML. The helpers at the top of the seed
  script build the node shapes; `src/endpoints/seed/post-1.ts` is the reference for more
  complex structures such as banners and media blocks.

`scripts/fix-meta-titles.ts` is a one-off that removed a duplicated site-name suffix from
post meta titles. Kept as a worked example of bulk-updating documents through the Local API.

## Seeding the chrome

`scripts/seed-navigation.ts` writes the header and footer link sets into the `header` and
`footer` globals, and creates the two pages the footer's legal links point at.

    npm run payload -- run scripts/seed-navigation.ts

**Restart the dev server afterwards.** The chrome reads its globals through
`unstable_cache`, and the hook that drops that cache runs inside the Next process — a
script writing through the Local API from outside it leaves the rendered page showing the
previous links. Edits made in the admin panel revalidate normally and need no restart.

The three category links point at `/articles?category=<slug>`, which is the same address
the index's own filter row uses. The index resolves the slug against the categories that
exist and drops one that matches nothing, so a link left in the globals after a category
is renamed shows the whole index rather than an empty page.

The privacy and terms pages carry placeholder copy stating that hrizonmedia is not open
yet. They exist so the footer does not point a reader at a 404, and are the Author's to
replace before launch.

## Branding

The template's site name has been replaced throughout `src/` with hrizonmedia, which
affects page titles, the SEO plugin's title suffix and Open Graph defaults. The homepage
itself is still the stock template layout.

The logo files served by the site live in `public/brand/`, copied from
`brand_guidelines/assets/`. The lockup leads the header and the mark alone sits in the
footer; each ships in two variants and the theme picks between them in CSS, so the correct
artwork is painted with the first frame. Never re-type the wordmark in a typeface — it is
artwork, and Manrope is close enough to be mistaken for it.

## Accounts and email

The project account is **app.encryptstream@gmail.com**. It is the Payload admin login and
the address that receives form submissions. It is deliberately **not published anywhere on
the site** — no footer contact link, no mailto.

**It cannot send the launch email, and this matters.** The early-access capture promises
"we will email you once, when it is ready", so eventually one message goes out to the whole
list. A gmail.com address cannot do that:

- Every ESP (Resend, SendGrid, Postmark) requires DNS verification of the sending domain.
  You cannot add DNS records to `gmail.com`, so sending _as_ this address through any of
  them is impossible.
- Gmail SMTP does work with an app password, but free accounts cap around 500 recipients
  per day and Google's terms exclude bulk marketing mail.

Before launch, register a sending address on `hrizonmedia.com` (see ADR-0001, which
records that we own it) and verify that domain with whichever ESP is chosen. Keep the Gmail
account as the admin login and inbox.

Do not wire Gmail SMTP as the transport. It will appear to work in testing and hit the
ceiling on the one day it matters.
