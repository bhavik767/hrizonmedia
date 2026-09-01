import type { Payload, RequiredDataFromCollectionSlug } from 'payload'

import { ARTICLES_PATH } from '../../utilities/routes'

/**
 * The link sets the chrome ships with. They live in the `header` and `footer`
 * globals rather than in the components, so the Author can change them in the
 * admin panel without a deploy — this module only decides what they start as.
 *
 * The category links point at the listing with a category on the query string,
 * the same address the index's own filter row uses. Which categories appear
 * here is data in the globals, not a component change.
 */

export const categories = [
  { href: `${ARTICLES_PATH}?category=piracy-problems`, title: 'Piracy problems' },
  { href: `${ARTICLES_PATH}?category=comparisons`, title: 'Comparisons' },
  { href: `${ARTICLES_PATH}?category=platform-guides`, title: 'Platform guides' },
]

export const legal = [
  { href: '/privacy', title: 'Privacy' },
  { href: '/terms', title: 'Terms' },
]

export const navItemsFor = (items: { href: string; title: string }[]) =>
  items.map(({ href, title }) => ({
    link: { type: 'custom' as const, label: title, url: href },
  }))

/**
 * The pages the legal links land on. They exist so the footer does not point a
 * reader at a 404 — the copy is a placeholder that states the true position
 * today, and is for the Author to replace before EncryptStream opens.
 */
export const legalPages = [
  {
    slug: 'privacy',
    title: 'Privacy',
    body:
      'EncryptStream is not open yet. The only thing this site collects is an email ' +
      'address you choose to give us, so that we can write to you once when the ' +
      'platform opens. It is not passed to anyone else. A full privacy policy is ' +
      'published here before EncryptStream opens.',
  },
  {
    slug: 'terms',
    title: 'Terms',
    body:
      'EncryptStream is not open yet, so there is nothing here to agree to. The terms ' +
      'that govern buying and using the platform are published here before it opens.',
  },
]

/**
 * Idempotent: globals are a single document, so writing them again simply
 * restores the shipped link sets over whatever is there.
 */
export async function seedNavigationGlobals(payload: Payload): Promise<void> {
  const context = { disableRevalidate: true }

  await payload.updateGlobal({
    slug: 'header',
    data: { navItems: navItemsFor(categories) },
    context,
  })

  await payload.updateGlobal({
    slug: 'footer',
    data: { navItems: navItemsFor(categories), legalItems: navItemsFor(legal) },
    context,
  })
}

/** Creates any legal page that is not there yet, and leaves existing ones alone. */
export async function seedLegalPages(payload: Payload): Promise<void> {
  for (const page of legalPages) {
    const existing = await payload.find({
      collection: 'pages',
      limit: 1,
      pagination: false,
      where: { slug: { equals: page.slug } },
    })

    if (existing.docs.length > 0) continue

    await payload.create({
      collection: 'pages',
      data: legalPageData(page),
      context: { disableRevalidate: true },
    })
  }
}

function legalPageData(page: {
  body: string
  slug: string
  title: string
}): RequiredDataFromCollectionSlug<'pages'> {
  return {
    _status: 'published',
    hero: {
      type: 'lowImpact',
      richText: richTextDocument([richTextHeading(page.title)]),
    },
    layout: [
      {
        blockType: 'content',
        columns: [
          {
            size: 'twoThirds',
            richText: richTextDocument([richTextParagraph(page.body)]),
          },
        ],
      },
    ],
    meta: { description: page.body, title: page.title },
    slug: page.slug,
    title: page.title,
  } as RequiredDataFromCollectionSlug<'pages'>
}

const richTextDocument = (children: unknown[]) => ({
  root: {
    type: 'root',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

const richTextText = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

const richTextHeading = (value: string) => ({
  type: 'heading',
  children: [richTextText(value)],
  direction: 'ltr',
  format: '',
  indent: 0,
  tag: 'h1',
  version: 1,
})

const richTextParagraph = (value: string) => ({
  type: 'paragraph',
  children: [richTextText(value)],
  direction: 'ltr',
  format: '',
  indent: 0,
  textFormat: 0,
  version: 1,
})
