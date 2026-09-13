import type { YouTubeVideoBlock as YouTubeVideoBlockProps } from 'src/payload-types'

import React from 'react'
import { cn } from '@/utilities/ui'
import { extractYouTubeId } from './config'

type Props = {
  className?: string
} & YouTubeVideoBlockProps

export const YouTubeVideoBlock: React.FC<Props> = ({ className, videoId, title }) => {
  const id = videoId ? extractYouTubeId(videoId) : null

  if (!id) return null

  return (
    <div className={cn('container', className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${id}`}
          title={title || 'YouTube video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  )
}
