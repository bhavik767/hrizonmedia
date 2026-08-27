import clsx from 'clsx'
import React from 'react'

import type { Post } from '@/payload-types'

import { Card } from '../../components/Card'

export type RelatedPostsProps = {
  className?: string
  docs?: Post[]
}

/**
 * Where a reader goes next. The card treatment is the shared one, so the
 * Article index gets the same grid rather than a second implementation of it.
 */
export const RelatedPosts: React.FC<RelatedPostsProps> = (props) => {
  const { className, docs } = props

  return (
    <section aria-labelledby="related-articles" className={clsx(className)}>
      <h2 className="text-h3 mb-6" id="related-articles">
        Related Articles
      </h2>

      <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
        {docs?.map((doc, index) => {
          if (typeof doc === 'string') return null

          return <Card key={index} doc={doc} relationTo="posts" showCategories />
        })}
      </div>
    </section>
  )
}
