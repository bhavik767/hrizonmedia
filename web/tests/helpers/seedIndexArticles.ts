import { getPayload, type Payload, type RequiredDataFromCollectionSlug } from 'payload'

import config from '../../src/payload.config.js'
import { articleCategories, categorySlug } from '../../src/endpoints/seed/articles.js'
import { ARTICLES_PER_PAGE } from '../../src/utilities/routes.js'

// Revalidation hooks call `revalidatePath`, which is unavailable outside a Next request.
const disableRevalidate = { context: { disableRevalidate: true } }

/**
 * Articles spread across the three categories that exist, so the index has
 * something for its filters to narrow.
 *
 * The counts are uneven on purpose. A filter that quietly showed everything, or
 * nothing, would still pass against an even split of one each — and one
 * category has to overflow a page of the listing, or there is nothing for the
 * filtered pagination to paginate to.
 */
export const indexArticlesFixture = {
  slugPrefix: 'test-index-article-',
  titlePrefix: 'Test Index Article ',
}

/** The page size the listing uses, so the spec does not restate it. */
export const articlesPerPage = ARTICLES_PER_PAGE

const overflowing = 'Piracy problems'

/**
 * Which category each fixture Article belongs to, by its number. The first
 * category runs one past a full page.
 */
const membership: [number, string][] = [
  ...Array.from(
    { length: ARTICLES_PER_PAGE + 1 },
    (_, i) => [i + 1, overflowing] as [number, string],
  ),
  [ARTICLES_PER_PAGE + 2, 'Comparisons'],
  [ARTICLES_PER_PAGE + 3, 'Comparisons'],
  [ARTICLES_PER_PAGE + 4, 'Platform guides'],
]

export const indexArticleTitle = (index: number): string =>
  `${indexArticlesFixture.titlePrefix}${index}`

/** The fixture Articles in a category, newest first — the order the index uses. */
export const indexArticleTitlesIn = (category: string): string[] =>
  membership
    .filter(([, title]) => title === category)
    .map(([index]) => indexArticleTitle(index))

export const indexArticleTitles = (): string[] => membership.map(([index]) => indexArticleTitle(index))

/** The categories the index offers, in the order it offers them. */
export const indexCategoryTitles = (): string[] => [...articleCategories].sort()

export const indexCategorySlug = categorySlug

export async function seedIndexArticles(): Promise<void> {
  const payload = await getPayload({ config })

  await deleteFixture({ payload })

  const categoryIds = await categoryIdsByTitle(payload)

  for (const [index, category] of membership) {
    await payload.create({
      collection: 'posts',
      data: {
        _status: 'published',
        categories: [categoryIds[category]!] as number[],
        content: doc(`One line about index Article ${index}.`),
        meta: { description: `What index Article ${index} is about, in one line.` },
        publishedAt: new Date(2026, 3, index, 9).toISOString(),
        slug: `${indexArticlesFixture.slugPrefix}${index}`,
        title: indexArticleTitle(index),
      },
      ...disableRevalidate,
    })
  }
}

export async function cleanupIndexArticles(): Promise<void> {
  await deleteFixture({ payload: await getPayload({ config }) })
}

/**
 * The three categories the site has. They are left in place afterwards — they
 * are site content the seed owns, not this fixture's to remove.
 */
async function categoryIdsByTitle(payload: Payload): Promise<Record<string, number | string>> {
  const ids: Record<string, number | string> = {}

  for (const title of articleCategories) {
    const existing = await payload.find({
      collection: 'categories',
      limit: 1,
      where: { title: { equals: title } },
    })

    ids[title] = existing.docs.length
      ? existing.docs[0]!.id
      : (
          await payload.create({
            collection: 'categories',
            data: { slug: categorySlug(title), title },
            ...disableRevalidate,
          })
        ).id
  }

  return ids
}

async function deleteFixture({ payload }: { payload: Payload }): Promise<void> {
  await payload.delete({
    collection: 'posts',
    where: { slug: { like: indexArticlesFixture.slugPrefix } },
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
