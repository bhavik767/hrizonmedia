import type { FAQBlock as FAQBlockProps } from 'src/payload-types'

import React from 'react'
import RichText from '@/components/RichText'
import { cn } from '@/utilities/ui'

// Deliberately not `FAQBlockProps` directly — this renders the FAQ tab's resolved data
// (heading + merged items; see src/fields/faq.ts and utilities/schema/faq.ts), which has no
// `blockType`/`id`/`blockName` the way a Payload block instance would.
type Props = {
  className?: string
} & Pick<FAQBlockProps, 'heading' | 'items'>

export const FAQBlock: React.FC<Props> = ({ className, heading, items }) => {
  if (!items || items.length === 0) return null

  return (
    <div className={cn('container', className)}>
      {heading && <h2 className="mb-6 text-2xl font-semibold">{heading}</h2>}
      <div className="divide-y divide-border rounded border border-border">
        {items.map((item, index) => (
          <details key={index} className="group p-4">
            <summary className="cursor-pointer list-none font-medium marker:content-none">
              {item.question}
            </summary>
            <div className="pt-3">
              <RichText data={item.answer} enableGutter={false} enableProse={false} />
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
