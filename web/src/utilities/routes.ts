/**
 * Where Articles live on the site.
 *
 * The collection that stores them is called `posts` and stays that way —
 * renaming it would buy a database migration for a name no reader ever sees.
 * The word a reader *does* see is "article", in the glossary and in the address
 * bar, so this module is the one place the code-only word is translated into
 * the canonical one. Nothing else should build an Article address by hand.
 */

/** The Article listing. */
export const ARTICLES_PATH = '/articles'

/**
 * The query string the listing is narrowed by. A category is a filter on the
 * listing, not a place of its own — an Article has one address, and the reader
 * who arrives from the header is looking at the index, filtered.
 */
export const CATEGORY_PARAM = 'category'

/** One Article. */
export const articlePath = (slug: string): string => `${ARTICLES_PATH}/${slug}`

/**
 * A page of the listing, optionally narrowed to one category. Page one is the
 * listing itself, and the category rides on the query string so that paging
 * through a filtered index keeps the filter.
 */
export const articleListingPath = (pageNumber: number, category?: string): string => {
  const path = pageNumber <= 1 ? ARTICLES_PATH : `${ARTICLES_PATH}/page/${pageNumber}`

  return category ? `${path}?${CATEGORY_PARAM}=${encodeURIComponent(category)}` : path
}

/**
 * Where a document of a linkable collection is read. Pages sit at the root;
 * Articles sit under the listing.
 */
export const documentPath = (relationTo: 'pages' | 'posts' | string, slug: string): string =>
  relationTo === 'posts' ? articlePath(slug) : `/${slug}`

/**
 * How many Articles fill one page of the listing.
 *
 * The listing, its paginated pages and the build step that decides which of
 * those pages to prerender all have to agree on this. They did not: the
 * prerender step divided by ten while the pages fetched twelve, so a build
 * with eleven Articles prerendered a second page that could never fill.
 */
export const ARTICLES_PER_PAGE = 12

/** How many pages the listing has, given the number of published Articles. */
export const articleListingPageCount = (totalArticles: number): number =>
  Math.ceil(totalArticles / ARTICLES_PER_PAGE)
