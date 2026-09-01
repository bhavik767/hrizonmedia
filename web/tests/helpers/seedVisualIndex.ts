import { getPayload, type Payload, type RequiredDataFromCollectionSlug } from 'payload'

import config from '../../src/payload.config.js'
import { categorySlug } from '../../src/endpoints/seed/articles.js'
import { articlePageFixture } from './seedArticlePage.js'
import { ensureSiteCategories } from './seedIndexArticles.js'

// Revalidation hooks call `revalidatePath`, which is unavailable outside a Next request.
const disableRevalidate = { context: { disableRevalidate: true } }

/**
 * Enough Articles for the index to be worth photographing.
 *
 * They go in the Article page fixture's category, and the baseline is taken of
 * the index narrowed to it. That is what makes the shot reproducible: the suite
 * shares one database and `article.e2e.spec.ts` leaves the ten launch Articles
 * in it, so an unnarrowed index holds a different number of cards depending on
 * what has already run. Narrowed to a category this spec owns, the page shows
 * these Articles and nothing else, whether the spec runs alone or last.
 *
 * Four of them, on top of the two the Article page fixture puts in the same
 * category, is six — two full rows at the desktop width, so the baseline covers
 * a grid that wraps rather than a single row.
 */
export const visualIndexFixture = {
  categorySlug: categorySlug(articlePageFixture.category),
  count: 4,
  slugPrefix: 'test-visual-index-',
  titlePrefix: 'Visual Baseline Article ',
}

/**
 * What each fixture Article says. Written out rather than generated, because a
 * baseline is a photograph: the same six cards have to carry the same six lines
 * of text every run, and lines of differing length are what prove the card
 * holds a short description and a long one the same way.
 */
const articles: { description: string; title: string }[] = [
  {
    description: 'Why an encrypted stream is not a protected one, in one line.',
    title: `${visualIndexFixture.titlePrefix}One`,
  },
  {
    description:
      'A longer supporting line, long enough to wrap onto a second and then a third line of the card, so the baseline covers a card that has to grow.',
    title: `${visualIndexFixture.titlePrefix}Two`,
  },
  {
    description: 'What a licence exchange does that a key in the page source does not.',
    title: `${visualIndexFixture.titlePrefix}Three`,
  },
  {
    description: 'Where watermarking helps, and where it only names the leak afterwards.',
    title: `${visualIndexFixture.titlePrefix}Four`,
  },
]

export async function seedVisualIndex(): Promise<void> {
  const payload = await getPayload({ config })

  await deleteFixture({ payload })

  /*
   * The filter row lists every category that exists, so the three the site
   * ships with have to be there or the row is a pill short when this spec runs
   * on its own.
   */
  await ensureSiteCategories(payload)

  const category = await payload.find({
    collection: 'categories',
    limit: 1,
    where: { slug: { equals: visualIndexFixture.categorySlug } },
  })

  const categoryId = category.docs[0]?.id

  if (!categoryId) {
    throw new Error(
      `The visual index fixture needs the Article page fixture's category. Seed seedArticlePage() first.`,
    )
  }

  for (const [index, { description, title }] of articles.entries()) {
    await payload.create({
      collection: 'posts',
      data: {
        _status: 'published',
        categories: [categoryId] as number[],
        content: doc(description),
        meta: { description },
        // Fixed dates: a baseline cannot hold a date that moves.
        publishedAt: new Date(Date.UTC(2026, 1, index + 1, 9)).toISOString(),
        slug: `${visualIndexFixture.slugPrefix}${index + 1}`,
        title,
      },
      ...disableRevalidate,
    })
  }
}

export async function cleanupVisualIndex(): Promise<void> {
  await deleteFixture({ payload: await getPayload({ config }) })
}

async function deleteFixture({ payload }: { payload: Payload }): Promise<void> {
  await payload.delete({
    collection: 'posts',
    where: { slug: { like: visualIndexFixture.slugPrefix } },
    ...disableRevalidate,
  })
}

function doc(value: string): RequiredDataFromCollectionSlug<'posts'>['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: value,
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  } as RequiredDataFromCollectionSlug<'posts'>['content']
}
