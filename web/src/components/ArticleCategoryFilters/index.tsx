import Link from 'next/link'
import React from 'react'

import type { Category } from '@/payload-types'

import { cn } from '@/utilities/ui'
import { articleListingPath } from '@/utilities/routes'

export type ArticleCategoryFiltersProps = {
  /** The slug currently narrowing the listing, if any. */
  activeCategory?: string
  categories: Pick<Category, 'id' | 'slug' | 'title'>[]
  className?: string
}

/**
 * How a reader narrows the index to the one thing they came about.
 *
 * These are ordinary links, not a control: the filtered index is a real address
 * a reader can bookmark or send to somebody, and narrowing works with
 * JavaScript switched off because nothing here depends on it. The header's
 * category links land on exactly the same addresses.
 *
 * Pills, so radius 999 — the same scale the rest of the brand uses. The active
 * one is filled rather than outlined, and carries `aria-current` so a reader who
 * cannot see the fill is told which it is.
 */
export const ArticleCategoryFilters: React.FC<ArticleCategoryFiltersProps> = ({
  activeCategory,
  categories,
  className,
}) => {
  if (categories.length === 0) return null

  const options = [
    { key: 'all', slug: undefined, title: 'All Articles' },
    ...categories.map((category) => ({
      key: String(category.id),
      slug: category.slug ?? undefined,
      title: category.title,
    })),
  ]

  return (
    <nav aria-label="Filter Articles by category" className={className}>
      <ul className="flex flex-wrap gap-2">
        {options.map(({ key, slug, title }) => {
          const isActive = (activeCategory ?? undefined) === slug

          return (
            <li key={key}>
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex rounded-full border border-border px-4 py-2 text-sm no-underline transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  isActive
                    ? 'bg-card text-heading'
                    : 'bg-transparent text-foreground hover:bg-accent hover:text-heading',
                )}
                href={articleListingPath(1, slug)}
              >
                {title}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
