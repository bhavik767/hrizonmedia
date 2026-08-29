import React from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/Media'
import { formatArticleDate } from '@/utilities/formatArticleDate'
import { getSiteAuthor } from '@/utilities/getAuthor'

/**
 * The head of an Article: what it is about, what it is called, and when it was
 * published, over the page's single radial glow.
 *
 * The glow is atmosphere and appears here and nowhere else on the page — two
 * glows on one screen cancel each other out. It is painted rather than
 * photographed, so the heading is legible before any image arrives.
 */
export async function PostHero({ post }: { post: Post }) {
  const { categories, heroImage, publishedAt, title } = post
  const { name: byline } = await getSiteAuthor()
  const categoryNames = (categories ?? [])
    .map((category) => (typeof category === 'object' ? category?.title : null))
    .filter((name): name is string => Boolean(name))

  return (
    <header className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[38rem] w-[64rem] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(243,195,12,0.16),rgba(243,195,12,0)_100%)]"
        data-glow
      />

      {heroImage && typeof heroImage !== 'string' && (
        <div className="absolute inset-0 -z-20 select-none">
          <Media fill priority imgClassName="object-cover opacity-40" resource={heroImage} />
        </div>
      )}

      {/*
        The scrim fades to the page's ground, not to black. A fixed black
        scrim would sit under the heading in the light theme and swallow it.
      */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 -z-10 h-1/2 w-full bg-linear-to-t from-background to-transparent"
        data-hero-scrim
      />

      <div className="container pb-14 pt-20 md:pt-28">
        <div className="max-w-[42rem]">
          {categoryNames.length > 0 && (
            <p className="mb-5 text-label uppercase tracking-[0.18em] text-caption">
              {categoryNames.join(' · ')}
            </p>
          )}

          <h1 className="mb-6">{title}</h1>

          <p className="text-sm text-caption">
            By <span className="text-foreground">{byline}</span>
            {publishedAt && (
              <>
                {' · Published '}
                <time className="text-foreground" dateTime={publishedAt}>
                  {formatArticleDate(publishedAt)}
                </time>
              </>
            )}
          </p>
        </div>
      </div>
    </header>
  )
}
