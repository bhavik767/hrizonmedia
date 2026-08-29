import type { DefaultTypedEditorState } from '@payloadcms/richtext-lexical'

export type ArticleHeading = {
  /** Index of the heading among the document root's children. */
  childIndex: number
  id: string
  level: 2 | 3
  text: string
}

/** The heading levels the contents is derived from. Nothing else appears in it. */
const CONTENTS_LEVELS = ['h2', 'h3'] as const

type SerializedNode = { children?: SerializedNode[]; tag?: string; text?: string; type?: string }

/**
 * Every heading in an Article that the contents lists, in document order, each
 * with the anchor its rendered heading carries.
 *
 * Anchors are derived from the heading's own words rather than authored, so the
 * Author maintains nothing and a link to a section keeps working as long as the
 * section keeps its name. Two headings that read the same are disambiguated by
 * a numeric suffix, in document order, so the second one is `-2`.
 */
export function articleHeadings(data: DefaultTypedEditorState | null | undefined): ArticleHeading[] {
  const children = (data?.root?.children ?? []) as SerializedNode[]
  const used = new Map<string, number>()

  return children.flatMap((node, childIndex) => {
    if (node?.type !== 'heading') return []
    if (!CONTENTS_LEVELS.includes(node.tag as (typeof CONTENTS_LEVELS)[number])) return []

    const text = headingText(node)
    if (!text) return []

    const base = slugify(text)
    const seen = (used.get(base) ?? 0) + 1
    used.set(base, seen)

    return [
      {
        childIndex,
        id: seen === 1 ? base : `${base}-${seen}`,
        level: node.tag === 'h2' ? (2 as const) : (3 as const),
        text,
      },
    ]
  })
}

/**
 * The anchors keyed by the position of their heading in the document, so the
 * rich text converter can label a heading with the same anchor the contents
 * points at without the two deriving it separately.
 */
export function headingAnchors(
  data: DefaultTypedEditorState | null | undefined,
): Record<number, string> {
  return Object.fromEntries(articleHeadings(data).map(({ childIndex, id }) => [childIndex, id]))
}

function headingText(node: SerializedNode): string {
  if (typeof node.text === 'string') return node.text

  return (node.children ?? []).map(headingText).join('')
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}
