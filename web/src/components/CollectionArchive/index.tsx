import { cn } from '@/utilities/ui'
import React from 'react'

import { Card, CardPostData } from '@/components/Card'

export type Props = {
  className?: string
  posts: CardPostData[]
}

/**
 * The one grid Articles are laid out in — the index, a paginated page of it,
 * the search results and the related Articles at the end of a piece all use
 * this. There is deliberately no second treatment: a card looks and sits the
 * same wherever a reader meets one.
 *
 * It lays out its own cards and nothing else, so the caller decides where it
 * sits on the page. That is why the container is not in here.
 */
export const CollectionArchive: React.FC<Props> = ({ className, posts }) => {
  return (
    <div
      className={cn(
        'grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {posts?.map((result, index) => {
        if (typeof result !== 'object' || result === null) return null

        return <Card className="h-full" doc={result} key={index} relationTo="posts" showCategories />
      })}
    </div>
  )
}
