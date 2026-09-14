import type { Author } from '@/payload-types'

import { getServerSideURL } from '../getURL'
import { resolveMediaUrl } from './resolveMediaUrl'

// Author -> schema.org Person, used as BlogPosting's `author`.
// signal (requirements.md section 4) doing double duty as structured data.
export function getPersonSchema(author: Author | null | undefined) {
  if (!author) return null

  const image = resolveMediaUrl(author.profileImage)

  const sameAs = (author.authorLinks || [])
    .map((entry) => (entry.link?.type === 'custom' ? entry.link.url : undefined))
    .filter((url): url is string => Boolean(url))

  let url: string | undefined
  if (author.profileURL) {
    url = author.profileURL.startsWith('http')
      ? author.profileURL
      : getServerSideURL() + (author.profileURL.startsWith('/') ? '' : '/') + author.profileURL
  }

  return {
    '@type': 'Person',
    name: author.name,
    ...(author.jobTitle ? { jobTitle: author.jobTitle } : {}),
    ...(image ? { image } : {}),
    ...(url ? { url } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }
}
