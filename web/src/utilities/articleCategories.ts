import type { Payload, Where } from 'payload'

import type { Category } from '@/payload-types'

/**
 * Narrowing the Article listing to one category.
 *
 * The slug has already been resolved against the categories that exist by
 * `articleListingCategories`, so anything reaching here names a real one.
 *
 * Returned as a spreadable fragment rather than a `Where`, so a caller with no
 * category passes no `where` at all instead of an empty one.
 */
export const articlesInCategory = (slug?: string): { where?: Where } =>
  slug ? { where: { 'categories.slug': { equals: slug } } } : {}

export type ArticleCategoryOption = Pick<Category, 'id' | 'slug' | 'title'>

/**
 * The categories the index offers as filters: the ones that exist, read from
 * the collection rather than listed in the component, so adding a fourth is a
 * content change and not a deploy.
 *
 * Sorted by title because the collection carries no order of its own. That is
 * arbitrary but stable, which is the property that matters — a filter row that
 * reshuffles itself when the Author edits a category is worse than one in an
 * order nobody chose.
 */
const articleCategoryOptions = async (
  payload: Payload,
): Promise<ArticleCategoryOption[]> => {
  const { docs } = await payload.find({
    collection: 'categories',
    depth: 0,
    overrideAccess: false,
    pagination: false,
    select: { slug: true, title: true },
    sort: 'title',
  })

  return docs.filter((category) => Boolean(category.slug))
}

/**
 * What the listing should show, given the category a reader asked for.
 *
 * The category links live in the `header` and `footer` globals, so a link can
 * outlive the category it names. A slug that matches nothing is dropped rather
 * than queried: the reader gets the whole index, which is where what does exist
 * can be found, instead of an empty page telling them nothing.
 */
export const articleListingCategories = async (
  payload: Payload,
  requested?: string,
): Promise<{ active?: string; options: ArticleCategoryOption[] }> => {
  const options = await articleCategoryOptions(payload)

  return { active: options.find(({ slug }) => slug === requested)?.slug ?? undefined, options }
}
