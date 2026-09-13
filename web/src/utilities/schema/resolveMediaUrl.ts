import { getServerSideURL } from '../getURL'

// Resolves a Payload media relationship (populated object or unpopulated id) to an absolute
// URL for use in JSON-LD, where relative URLs aren't valid.
export function resolveMediaUrl(media: unknown): string | undefined {
  if (media && typeof media === 'object' && 'url' in media) {
    const url = (media as { url?: string | null }).url
    if (!url) return undefined
    return url.startsWith('http') ? url : getServerSideURL() + url
  }
  return undefined
}
