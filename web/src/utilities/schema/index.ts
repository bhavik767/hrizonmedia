import type { Organization as OrganizationGlobal, Page, Post } from '@/payload-types'

import { getArticleSchema } from './article'
import { getBreadcrumbSchema } from './breadcrumbs'
import { getCourseSchema } from './course'
import { getFAQSchema } from './faq'
import { getVideoSchemas } from './video'

// Assembles the full JSON-LD @graph for a Post: Article/BlogPosting, BreadcrumbList, FAQ
// (whenever the FAQ tab resolves to any items), and Video (whenever a YouTube Video block is
// present) are always attempted. (HowTo support was removed from this project.)
// See adrs/adr-012-structured-data-implementation.md.
export function buildPostSchema({
  post,
  organization,
}: {
  post: Post
  organization: OrganizationGlobal | null | undefined
}) {
  const graph: Record<string, unknown>[] = [
    getArticleSchema({ post, organization }),
    getBreadcrumbSchema({ path: `/posts/${post.slug}`, title: post.title }),
  ]

  const faq = getFAQSchema(post.faq)
  if (faq) graph.push(faq)

  graph.push(...getVideoSchemas(post.content))

  return { '@context': 'https://schema.org', '@graph': graph }
}

// Assembles the full JSON-LD @graph for a Page: BreadcrumbList, FAQ (whenever the FAQ tab
// resolves to any items), and Video (whenever a YouTube Video block is present) are always
// attempted; Course is opt-in via the `structuredData` selector. (HowTo support was removed
// from this project.)
export function buildPageSchema({
  page,
  organization,
}: {
  page: Page
  organization: OrganizationGlobal | null | undefined
}) {
  const selected = page.structuredData || []

  const graph: Record<string, unknown>[] = [
    getBreadcrumbSchema({ path: `/${page.slug}`, title: page.title }),
  ]

  const faq = getFAQSchema(page.faq)
  if (faq) graph.push(faq)

  graph.push(...getVideoSchemas(page.layout))

  if (selected.includes('course')) {
    const course = getCourseSchema({ page, organization })
    if (course) graph.push(course)
  }

  return { '@context': 'https://schema.org', '@graph': graph }
}
