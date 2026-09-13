import { getServerSideURL } from '../getURL'

// BreadcrumbList schema — derived purely from the resolved page's URL path, with the final
// segment's label replaced by the document's own title for accuracy. No editor input, no
// toggle. `SEGMENT_LABELS` covers path segments that aren't self-explanatory as URL slugs
// (currently just `/posts/`, this codebase's existing blog route — ADR-005 anticipates this
// moving to `/blog/` eventually, at which point this map should be updated to match).
// See adrs/adr-012-structured-data-implementation.md.
const SEGMENT_LABELS: Record<string, string> = {
  posts: 'Blog',
}

function humanize(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function getBreadcrumbSchema({ path, title }: { path: string; title: string }) {
  const serverUrl = getServerSideURL()
  const segments = path.split('/').filter(Boolean)

  const items: { name: string; url: string }[] = [{ name: 'Home', url: `${serverUrl}/` }]

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    const url = `${serverUrl}/${segments.slice(0, index + 1).join('/')}`
    const name = isLast ? title : SEGMENT_LABELS[segment] || humanize(segment)
    items.push({ name, url })
  })

  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}
