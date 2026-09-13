import React from 'react'

import type { GlobalCarouselBlock as GlobalCarouselBlockProps } from '@/payload-types'

import { CarouselBlock } from '@/blocks/Carousel/Component'

export const GlobalCarouselBlock: React.FC<GlobalCarouselBlockProps> = ({ reusableBlock }) => {
  if (!reusableBlock || typeof reusableBlock !== 'object') return null

  const inner = reusableBlock.content?.[0]

  if (!inner || inner.blockType !== 'carousel') return null

  return <CarouselBlock {...inner} />
}
