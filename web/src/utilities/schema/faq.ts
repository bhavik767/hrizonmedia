import type { DefaultTypedEditorState } from '@payloadcms/richtext-lexical'
import { convertLexicalToHTML, defaultHTMLConverters } from '@payloadcms/richtext-lexical/html'

export type FAQItem = { question: string; answer: DefaultTypedEditorState }

// Loosely typed on purpose: this reads Post['faq'] / Page['faq'] (whose generated shape is
// exact but awkward to restate here) as well as manually-constructed data in the same shape.
// Runtime duck-typing (as in collectBlocks.ts) instead of fighting the generated types.
type FAQTabData = unknown

// Merges the FAQ tab's directly-written items with whichever shared FAQs are imported
// (ADR-011) into one flat, valid list — used both to render the FAQ section on the page and to
// build FAQPage schema from it, so the two can never disagree.
export function resolveFAQItems(faq: FAQTabData): FAQItem[] {
  if (!faq || typeof faq !== 'object') return []

  const rawItems = (faq as Record<string, unknown>).items
  const items: { question?: unknown; answer?: unknown }[] = Array.isArray(rawItems)
    ? [...(rawItems as { question?: unknown; answer?: unknown }[])]
    : []

  const imported = (faq as Record<string, unknown>).importedFAQ
  if (Array.isArray(imported)) {
    for (const ref of imported) {
      if (ref && typeof ref === 'object' && 'content' in ref) {
        const content = (ref as { content?: unknown }).content
        const inner = Array.isArray(content) ? (content[0] as Record<string, unknown>) : undefined
        if (inner?.blockType === 'faq' && Array.isArray(inner.items)) {
          items.push(...(inner.items as { question?: unknown; answer?: unknown }[]))
        }
      }
    }
  }

  return items.filter(
    (item): item is FAQItem =>
      typeof item.question === 'string' && item.question.length > 0 && Boolean(item.answer),
  )
}

// FAQPage schema — a post/page simply "has FAQ" if the FAQ tab resolves to any items; there's
// no separate opt-in flag (see adrs/adr-012-structured-data-implementation.md).
export function getFAQSchema(faq: FAQTabData) {
  const items = resolveFAQItems(faq)
  if (items.length === 0) return null

  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: convertLexicalToHTML({ data: item.answer, converters: defaultHTMLConverters }),
      },
    })),
  }
}
