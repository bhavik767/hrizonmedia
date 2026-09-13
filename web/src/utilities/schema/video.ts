import { extractYouTubeId } from '@/blocks/YouTubeVideo/config'

import { collectBlocks } from './collectBlocks'

// VideoObject schema — one entry per YouTube Video block on the page, always attempted (not
// gated behind the Structured Data selector): using the block IS the opt-in, since its own
// form already collects everything the schema needs. All fields come directly from what the
// editor typed into the block (no oEmbed/YouTube Data API call); thumbnailUrl is derived from
// the video ID via YouTube's predictable thumbnail URL pattern.
// Per Google's guidelines, name/thumbnailUrl/uploadDate are required for VideoObject
// eligibility — the YouTube Video block enforces uploadDate as required for this reason.
// See adrs/adr-012-structured-data-implementation.md.
export function getVideoSchemas(source: unknown) {
  const blocks = collectBlocks(source, ['youtubeVideo'])

  const videos: Record<string, unknown>[] = []

  for (const block of blocks) {
    const rawId = typeof block.videoId === 'string' ? block.videoId : ''
    const id = extractYouTubeId(rawId)
    if (!id || !block.title || !block.uploadDate) continue

    videos.push({
      '@type': 'VideoObject',
      name: block.title,
      thumbnailUrl: [`https://img.youtube.com/vi/${id}/hqdefault.jpg`],
      uploadDate: new Date(block.uploadDate as string).toISOString(),
      embedUrl: `https://www.youtube.com/embed/${id}`,
      ...(block.description ? { description: block.description } : {}),
    })
  }

  return videos
}
