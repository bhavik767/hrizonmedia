import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

import { ArticleCategoryFilters } from '@/components/ArticleCategoryFilters'
import { CollectionArchive } from '@/components/CollectionArchive'
import { PageRange } from '@/components/PageRange'
import { Pagination } from '@/components/Pagination'
import { articleListingCategories, articlesInCategory } from '@/utilities/articleCategories'
import { ARTICLES_PER_PAGE } from '@/utilities/routes'

export type ArticleListingProps = {
  /** The category slug a reader asked for, unresolved. */
  category?: string
  pageNumber?: number
}

/**
 * The Article index: everything published, narrowable to one category.
 *
 * `/articles` and `/articles/page/<n>` are the same listing at two addresses,
 * so they are the same component with a different page number rather than two
 * copies that have to be kept in step. They were two copies, and the page size
 * drifting between them is what shipped an empty prerendered page.
 */
export const ArticleListing: React.FC<ArticleListingProps> = async ({
  category: requestedCategory,
  pageNumber = 1,
}) => {
  const payload = await getPayload({ config: configPromise })

  const { active: category, options: categories } = await articleListingCategories(
    payload,
    requestedCategory,
  )

  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: ARTICLES_PER_PAGE,
    overrideAccess: false,
    page: pageNumber,
    select: {
      title: true,
      slug: true,
      categories: true,
      meta: true,
    },
    ...articlesInCategory(category),
  })

  return (
    <div className="pt-24 pb-24">
      <div className="container mb-16">
        <div className="prose max-w-none">
          <h1>Articles</h1>
        </div>

        <ArticleCategoryFilters
          activeCategory={category}
          categories={categories}
          className="mt-8"
        />
      </div>

      <div className="container mb-8">
        <PageRange
          collection="posts"
          currentPage={posts.page}
          limit={ARTICLES_PER_PAGE}
          totalDocs={posts.totalDocs}
        />
      </div>

      <div className="container">
        <CollectionArchive posts={posts.docs} />
      </div>

      <div className="container">
        {posts.page && posts.totalPages > 1 && (
          <Pagination category={category} page={posts.page} totalPages={posts.totalPages} />
        )}
      </div>
    </div>
  )
}
