'use client'
import { documentPath } from '@/utilities/routes'
import { cn } from '@/utilities/ui'
import useClickableCard from '@/utilities/useClickableCard'
import Link from 'next/link'
import React, { Fragment } from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/Media'

export type CardPostData = Pick<Post, 'slug' | 'categories' | 'meta' | 'title'>

/**
 * One Article, shown so a reader can tell whether it applies to them without
 * opening it: what it is about, what it is called, and a line of supporting
 * detail.
 *
 * Depth is a hairline and the panel colour, never a shadow, and there is no
 * glow on a card — the page's one glow is behind the hero.
 */
export const Card: React.FC<{
  alignItems?: 'center'
  className?: string
  doc?: CardPostData
  relationTo?: 'posts'
  showCategories?: boolean
  title?: string
}> = (props) => {
  const { card, link } = useClickableCard({})
  const { className, doc, relationTo, showCategories, title: titleFromProps } = props

  const { slug, categories, meta, title } = doc || {}
  const { description, image: metaImage } = meta || {}

  const hasCategories = categories && Array.isArray(categories) && categories.length > 0
  const titleToUse = titleFromProps || title
  const sanitizedDescription = description?.replace(/\s/g, ' ') // replace non-breaking space with white space
  const href = documentPath(relationTo ?? 'posts', String(slug))

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-card border border-border bg-card transition-colors hover:cursor-pointer hover:bg-accent',
        className,
      )}
      ref={card.ref}
    >
      {metaImage && typeof metaImage !== 'string' && (
        <div className="relative w-full border-b border-border">
          <Media resource={metaImage} size="33vw" />
        </div>
      )}

      <div className="flex flex-col gap-3 p-5">
        {showCategories && hasCategories && (
          <p className="text-label uppercase tracking-[0.18em] text-caption">
            {categories?.map((category, index) => {
              if (typeof category === 'object') {
                const { title: titleFromCategory } = category

                const categoryTitle = titleFromCategory || 'Untitled category'

                const isLast = index === categories.length - 1

                return (
                  <Fragment key={index}>
                    {categoryTitle}
                    {!isLast && <Fragment>, &nbsp;</Fragment>}
                  </Fragment>
                )
              }

              return null
            })}
          </p>
        )}

        {titleToUse && (
          <h3 className="text-h3">
            <Link
              className="text-heading no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href={href}
              ref={link.ref}
            >
              {titleToUse}
            </Link>
          </h3>
        )}

        {description && <p className="text-sm">{sanitizedDescription}</p>}
      </div>
    </article>
  )
}
