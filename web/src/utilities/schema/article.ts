import type { Author, Organization as OrganizationGlobal, Post } from '@/payload-types'

import { getServerSideURL } from '../getURL'
import { getOrganizationSchema } from './organization'
import { getPersonSchema } from './person'
import { resolveMediaUrl } from './resolveMediaUrl'

// Article (BlogPosting) schema — always on for Posts, fully derived from fields that already
// exist for other reasons. No schema-specific fields on the Post itself.
// See adrs/adr-012-structured-data-implementation.md.
export function getArticleSchema({
  post,
  organization,
}: {
  post: Post
  organization: OrganizationGlobal | null | undefined
}) {
  const url = `${getServerSideURL()}/posts/${post.slug}`
  const image = resolveMediaUrl(post.heroImage)
  const publisher = getOrganizationSchema(organization)

  const authors = (post.authors || [])
    .filter((author): author is Author => typeof author === 'object' && author !== null)
    .map((author) => getPersonSchema(author))
    .filter(Boolean)

  return {
    '@type': 'BlogPosting',
    headline: post.title,
    mainEntityOfPage: url,
    url,
    ...(image ? { image } : {}),
    ...(post.createdAt ? { datePublished: new Date(post.createdAt).toISOString() } : {}),
    ...(post.updatedAt ? { dateModified: new Date(post.updatedAt).toISOString() } : {}),
    ...(publisher ? { publisher } : {}),
    ...(authors.length === 1 ? { author: authors[0] } : {}),
    ...(authors.length > 1 ? { author: authors } : {}),
  }
}
