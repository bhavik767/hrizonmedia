import React from 'react'

import type { KeyTakeawaysBlock as KeyTakeawaysBlockProps } from '@/payload-types'

import { cn } from '@/utilities/ui'

export const DEFAULT_KEY_TAKEAWAYS_LABEL = 'Key takeaways'

type Props = {
  /** The anchor the contents points at, when the Author gave the box a heading. */
  anchor?: string
  className?: string
} & KeyTakeawaysBlockProps

/**
 * The argument, without the supporting detail, for a reader who is skimming.
 *
 * A panel rather than a run of prose, because it has to be catchable at a
 * glance; a numbered list, because the claims are ordered and each one is meant
 * to stand on its own. Depth is a hairline and a change of value — no shadow.
 */
export const KeyTakeawaysBlock: React.FC<Props> = ({ anchor, className, heading, takeaways }) => {
  const title = heading?.trim()
  const claims = (takeaways ?? []).filter((row) => row?.statement?.trim())

  if (claims.length === 0) return null

  return (
    <section
      aria-label={title ? undefined : DEFAULT_KEY_TAKEAWAYS_LABEL}
      aria-labelledby={title ? anchor : undefined}
      className={cn(
        'not-prose my-10 rounded-plate border border-border bg-card px-6 py-6 sm:px-8',
        className,
      )}
    >
      {title ? (
        <h2 className="mb-4 scroll-mt-28 text-h3" id={anchor}>
          {title}
        </h2>
      ) : (
        <p className="mb-4 text-label uppercase tracking-[0.18em] text-caption">
          {DEFAULT_KEY_TAKEAWAYS_LABEL}
        </p>
      )}

      <ol className="flex list-decimal flex-col gap-3 pl-5 marker:text-caption marker:font-mono">
        {claims.map(({ id, statement }, index) => (
          <li className="pl-1 text-foreground" key={id ?? index}>
            {statement}
          </li>
        ))}
      </ol>
    </section>
  )
}
