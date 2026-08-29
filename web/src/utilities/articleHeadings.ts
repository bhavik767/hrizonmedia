import type { DefaultTypedEditorState } from '@payloadcms/richtext-lexical'

export type ArticleHeading = {
  /** Index of the heading, or of the block that holds it, among the root's children. */
  childIndex: number
  id: string
  level: 2 | 3
  text: string
}

/** The anchors a single block's own headings carry, in the order it renders them. */
export type BlockAnchors = {
  heading?: string
  questions: string[]
}

/**
 * The anchors the body has to label its headings with, keyed by the position of
 * the root child that renders them: `headings` for the document's own headings,
 * `blocks` for the ones a block renders itself.
 */
export type RenderedAnchors = {
  blocks: Record<number, BlockAnchors>
  headings: Record<number, string>
}

/** The heading levels the contents is derived from. Nothing else appears in it. */
const CONTENTS_LEVELS = ['h2', 'h3'] as const

type SerializedNode = {
  children?: SerializedNode[]
  fields?: Record<string, any>
  tag?: string
  text?: string
  type?: string
}

type Walk = {
  blocks: Record<number, BlockAnchors>
  headings: ArticleHeading[]
  rootAnchors: Record<number, string>
}

/**
 * Every heading in an Article that the contents lists, in document order, each
 * with the anchor its rendered heading carries.
 *
 * One rule, no exceptions: every second- and third-level heading in the body is
 * listed. That includes the headings the Key takeaways and FAQ blocks render —
 * they are sections of the Article like any other, and a contents that silently
 * skipped them would be describing a different document from the one on screen.
 *
 * Anchors are derived from the heading's own words rather than authored, so the
 * Author maintains nothing and a link to a section keeps working as long as the
 * section keeps its name. Two headings that read the same are disambiguated by
 * a numeric suffix, in document order, so the second one is `-2`. That holds
 * across the whole document, which is what lets one Article carry two FAQ
 * blocks asking the same question without them fighting over an anchor.
 */
export function articleHeadings(
  data: DefaultTypedEditorState | null | undefined,
): ArticleHeading[] {
  return walk(data).headings
}

/**
 * The anchors the rich text converter labels the body with, so a heading and the
 * contents entry pointing at it cannot drift: both come out of one walk over one
 * document rather than each deriving its own.
 */
export function renderedAnchors(data: DefaultTypedEditorState | null | undefined): RenderedAnchors {
  const { blocks, rootAnchors } = walk(data)

  return { blocks, headings: rootAnchors }
}

function walk(data: DefaultTypedEditorState | null | undefined): Walk {
  const children = (data?.root?.children ?? []) as SerializedNode[]
  const used = new Map<string, number>()
  const result: Walk = { blocks: {}, headings: [], rootAnchors: {} }

  const anchor = (text: string): string => {
    const base = slugify(text)
    const seen = (used.get(base) ?? 0) + 1
    used.set(base, seen)

    return seen === 1 ? base : `${base}-${seen}`
  }

  const list = (childIndex: number, level: 2 | 3, text: string): string => {
    const id = anchor(text)
    result.headings.push({ childIndex, id, level, text })

    return id
  }

  children.forEach((node, childIndex) => {
    if (node?.type === 'heading') {
      if (!CONTENTS_LEVELS.includes(node.tag as (typeof CONTENTS_LEVELS)[number])) return

      const text = headingText(node)
      if (!text) return

      result.rootAnchors[childIndex] = list(childIndex, node.tag === 'h2' ? 2 : 3, text)
      return
    }

    if (node?.type !== 'block') return

    const { blockType, heading, questions } = node.fields ?? {}
    if (blockType !== 'keyTakeaways' && blockType !== 'faq') return

    const anchors: BlockAnchors = { questions: [] }
    const title = typeof heading === 'string' ? heading.trim() : ''

    if (title) anchors.heading = list(childIndex, 2, title)

    if (blockType === 'faq') {
      /*
       * A question sits one level under its block's heading, and takes that
       * heading's place when the block has none — so the block always opens at
       * the second level and never skips one.
       */
      for (const row of (questions ?? []) as Array<{ question?: string }>) {
        const text = row?.question?.trim()
        if (!text) continue

        anchors.questions.push(list(childIndex, title ? 3 : 2, text))
      }
    }

    result.blocks[childIndex] = anchors
  })

  return result
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
