'use client'

import Image from 'next/image'
import { useState } from 'react'

export function ThumbnailPreview({ title, src }: { title: string; src?: string }) {
  const [unavailable, setUnavailable] = useState(false)

  if (!src || unavailable) return <span>{title}</span>

  return (
    <Image
      alt={`Thumbnail for ${title}`}
      fill
      onError={() => setUnavailable(true)}
      sizes="(max-width: 900px) 100vw, 36vw"
      src={src}
      unoptimized
    />
  )
}
