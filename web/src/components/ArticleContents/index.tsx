'use client'

import React, { useEffect, useState } from 'react'

import type { ArticleHeading } from '@/utilities/articleHeadings'

import { cn } from '@/utilities/ui'

/**
 * The Article's contents, derived from its headings at render time.
 *
 * Its entries are ordinary anchors inside a navigation landmark. The component
 * is rendered on the server like any other, so with JavaScript switched off a
 * reader still gets the full list of links — only the reading position stops
 * being tracked.
 */
export const ArticleContents: React.FC<{
  className?: string
  headings: ArticleHeading[]
}> = ({ className, headings }) => {
  const active = useHeadingBeingRead(headings)

  if (headings.length === 0) return null

  return (
    <nav aria-label="On this page" className={cn(className)}>
      <ul className="flex flex-col border-l border-border">
        {headings.map(({ id, level, text }) => (
          <li key={id}>
            <a
              aria-current={id === active ? 'true' : undefined}
              className={cn(
                '-ml-px block border-l border-transparent py-1 pl-4 text-sm text-caption no-underline',
                'hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                { 'pl-8': level === 3 },
                { 'border-l-heading text-heading': id === active },
              )}
              href={`#${id}`}
            >
              {text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The same contents where there is no room for a second column: a disclosure
 * sitting directly beneath the hero, closed to start with so it offers the
 * Article's shape without consuming the screen.
 */
export const ArticleContentsDisclosure: React.FC<{
  className?: string
  headings: ArticleHeading[]
}> = ({ className, headings }) => {
  if (headings.length === 0) return null

  return (
    <details className={cn('mb-10 rounded-card border border-border bg-card', className)}>
      <summary className="cursor-pointer px-4 py-3 text-label uppercase tracking-[0.18em] text-caption">
        On this page
      </summary>

      <ArticleContents className="px-4 pb-4" headings={headings} />
    </details>
  )
}

/**
 * The heading the reader is currently under, by intersection observation
 * against the heading positions. The observer fires as a heading crosses the
 * band just below the header; the answer is then read off the rects, because
 * "which section am I in" is a question about the last heading passed, not
 * about which headings happen to be on screen.
 */
function useHeadingBeingRead(headings: ArticleHeading[]): null | string {
  const [active, setActive] = useState<null | string>(null)
  const ids = headings.map(({ id }) => id).join(' ')

  useEffect(() => {
    const targets = ids
      .split(' ')
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)

    if (targets.length === 0) return

    const passedBy = 140

    const update = () => {
      let current = targets[0]!.id

      for (const target of targets) {
        if (target.getBoundingClientRect().top <= passedBy) current = target.id
      }

      setActive(current)
    }

    const observer = new IntersectionObserver(update, {
      rootMargin: `-${passedBy}px 0px 0px 0px`,
      threshold: [0, 1],
    })

    targets.forEach((target) => observer.observe(target))
    update()

    return () => observer.disconnect()
  }, [ids])

  return active
}
