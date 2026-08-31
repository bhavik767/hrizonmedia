import React from 'react'

import type { FaqBlock as FaqBlockProps } from '@/payload-types'

import RichText from '@/components/RichText'
import { cn } from '@/utilities/ui'

export const DEFAULT_FAQ_LABEL = 'Frequently asked questions'

type Props = {
  /** The anchor the contents points at, when the Author gave the section a heading. */
  anchor?: string
  className?: string
  /** One anchor per question, in the order the questions render. */
  questionAnchors?: string[]
} & FaqBlockProps

/**
 * The questions a reader arrives with, answered where they arise.
 *
 * Answers are plain content in the document, not a disclosure: hiding them
 * makes a reader act before they can read, and puts the text out of reach of
 * anything extracting an answer from the page. A question is a heading so it
 * can be navigated to and linked at, one level under the section's own heading
 * — or at that level itself when the Author gave the section none, so the
 * outline never skips a step.
 */
export const FaqBlock: React.FC<Props> = ({
  anchor,
  className,
  heading,
  questionAnchors = [],
  questions,
}) => {
  const title = heading?.trim()
  const asked = (questions ?? []).filter((row) => row?.question?.trim())

  if (asked.length === 0) return null

  const Question = title ? 'h3' : 'h2'

  return (
    <section
      aria-label={title ? undefined : DEFAULT_FAQ_LABEL}
      aria-labelledby={title ? anchor : undefined}
      className={cn('not-prose my-12', className)}
    >
      {title && (
        <h2 className="mb-6 scroll-mt-28" id={anchor}>
          {title}
        </h2>
      )}

      <ol className="flex list-none flex-col gap-3 p-0">
        {asked.map(({ answer, id, question }, index) => (
          <li className="rounded-card border border-border bg-card px-6 py-5" key={id ?? index}>
            <Question className="scroll-mt-28 text-h3" id={questionAnchors[index]}>
              {question}
            </Question>

            <RichText className="mt-2" data={answer} enableGutter={false} enableProse={false} />
          </li>
        ))}
      </ol>
    </section>
  )
}
