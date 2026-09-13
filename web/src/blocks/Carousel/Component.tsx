'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import React, { useCallback, useState } from 'react'

import type { CarouselBlock as CarouselBlockProps } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { Media } from '@/components/Media'
import { Button } from '@/components/ui/button'
import { cn } from '@/utilities/ui'

export const CarouselBlock: React.FC<CarouselBlockProps> = ({ slides }) => {
  const [activeIndex, setActiveIndex] = useState(0)
  const count = slides?.length ?? 0

  const goTo = useCallback(
    (index: number) => {
      if (count === 0) return
      setActiveIndex(((index % count) + count) % count)
    },
    [count],
  )

  if (!slides || slides.length === 0) return null

  return (
    <div className="container">
      <div className="relative overflow-hidden rounded-[0.8rem] border border-border">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {slides.map((slide, index) => {
            const { image, heading, caption, enableLink, link: slideLink } = slide

            return (
              <div className="w-full shrink-0" key={index}>
                <div className="relative aspect-[16/9] w-full bg-muted">
                  <Media fill imgClassName="object-cover" resource={image} />
                </div>
                {(heading || caption || (enableLink && slideLink)) && (
                  <div className="p-4 lg:p-6">
                    {heading && <h3 className="mb-1 text-xl font-semibold">{heading}</h3>}
                    {caption && <p className="mb-2 text-muted-foreground">{caption}</p>}
                    {enableLink && slideLink && <CMSLink {...slideLink} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {slides.length > 1 && (
          <>
            <Button
              aria-label="Previous slide"
              className="absolute left-2 top-1/2 -translate-y-1/2"
              onClick={() => goTo(activeIndex - 1)}
              size="icon"
              type="button"
              variant="secondary"
            >
              <ChevronLeft />
            </Button>
            <Button
              aria-label="Next slide"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => goTo(activeIndex + 1)}
              size="icon"
              type="button"
              variant="secondary"
            >
              <ChevronRight />
            </Button>

            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
              {slides.map((_, index) => (
                <button
                  aria-label={`Go to slide ${index + 1}`}
                  className={cn(
                    'h-2 w-2 rounded-full transition-colors',
                    index === activeIndex ? 'bg-primary' : 'bg-primary/30',
                  )}
                  key={index}
                  onClick={() => goTo(index)}
                  type="button"
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
