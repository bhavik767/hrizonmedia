import type { StaticImageData } from 'next/image'

import { cn } from '@/utilities/ui'
import React from 'react'
import RichText from '@/components/RichText'

import type { MediaBlock as MediaBlockProps } from '@/payload-types'

import { Media } from '../../components/Media'

type Props = MediaBlockProps & {
  breakout?: boolean
  captionClassName?: string
  className?: string
  enableGutter?: boolean
  imgClassName?: string
  staticImage?: StaticImageData
  disableInnerContainer?: boolean
}

export const MediaBlock: React.FC<Props> = (props) => {
  const {
    captionClassName,
    className,
    enableGutter = true,
    imgClassName,
    media,
    staticImage,
    disableInnerContainer,
  } = props

  let caption
  if (media && typeof media === 'object') caption = media.caption

  return (
    <figure
      className={cn(
        'my-8',
        {
          container: enableGutter,
        },
        className,
      )}
    >
      {(media || staticImage) && (
        /*
          The picture sits on the panel colour behind a hairline, so a
          screenshot with a transparent or near-white background stays legible
          on either ground rather than washing out in one of them.
        */
        <Media
          className="overflow-hidden rounded-card border border-border bg-card"
          imgClassName={cn('m-0 w-full', imgClassName)}
          resource={media}
          src={staticImage}
        />
      )}
      {caption && (
        /*
          The caption is a source line: it is what makes a claim in a figure
          checkable, so it reads as attribution rather than as body copy.
        */
        <figcaption
          className={cn(
            'mt-3 text-sm text-caption',
            {
              container: !disableInnerContainer,
            },
            captionClassName,
          )}
        >
          <RichText data={caption} enableGutter={false} enableProse={false} />
        </figcaption>
      )}
    </figure>
  )
}
