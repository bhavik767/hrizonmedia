import type { Block } from 'payload'

// Plain (non-reusable) YouTube embed block. Collects both what's needed to render the embed
// and what's needed for VideoObject structured data directly from the editor — no oEmbed/
// YouTube Data API call, since that would need an API key/quota and still wouldn't provide
// uploadDate. Deliberately not a Global/reusable block — a specific video embed shouldn't
// propagate to other pages. See adrs/adr-012-structured-data-implementation.md.
export const YouTubeVideo: Block = {
  slug: 'youtubeVideo',
  interfaceName: 'YouTubeVideoBlock',
  labels: {
    plural: 'YouTube Videos',
    singular: 'YouTube Video',
  },
  fields: [
    {
      name: 'videoId',
      type: 'text',
      label: 'YouTube Video ID or URL',
      required: true,
      admin: {
        description:
          'Paste either the 11-character YouTube video ID or a full YouTube URL (watch, youtu.be, or embed link) — the ID is extracted automatically.',
      },
      validate: (value: string | null | undefined) => {
        if (!value) return 'A YouTube video ID or URL is required.'
        return extractYouTubeId(value) ? true : 'Could not find a YouTube video ID in that value.'
      },
    },
    {
      name: 'title',
      type: 'text',
      label: 'Title',
      required: true,
      admin: {
        description: 'Populates VideoObject schema\'s required "name" field.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Description',
      admin: {
        description: 'Optional. Populates VideoObject schema\'s "description" field.',
      },
    },
    {
      name: 'uploadDate',
      type: 'date',
      label: 'Upload Date',
      required: true,
      admin: {
        description:
          'Required by Google for VideoObject eligibility, along with title/thumbnail — the date this video was originally published on YouTube. Populates VideoObject schema\'s "uploadDate" field.',
        date: {
          pickerAppearance: 'dayOnly',
        },
      },
    },
  ],
}

// Accepts a bare 11-character video ID, or a watch/share/embed YouTube URL, and returns the
// video ID. Shared by the field validator above and the schema/render-time helpers that need
// the same extraction logic.
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim()

  if (/^[\w-]{11}$/.test(trimmed)) return trimmed

  try {
    const url = new URL(trimmed)
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.slice(1)
      return /^[\w-]{11}$/.test(id) ? id : null
    }
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v')
        return id && /^[\w-]{11}$/.test(id) ? id : null
      }
      const embedMatch = url.pathname.match(/\/(embed|shorts)\/([\w-]{11})/)
      if (embedMatch) return embedMatch[2]
    }
  } catch {
    // not a URL — fall through
  }

  return null
}
