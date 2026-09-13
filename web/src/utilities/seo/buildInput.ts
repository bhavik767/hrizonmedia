import { extractBodyContent } from './extractContent'

import type { SeoAnalysisInput } from './types'

export type SeoDocShape = {
  faq?: {
    items?: unknown
  } | null
  hero?: {
    richText?: unknown
  } | null
  layout?: unknown
  content?: unknown
  meta?: {
    description?: null | string
    focusKeyword?: null | string
    title?: null | string
  } | null
  slug?: null | string
  title?: null | string
}

/**
 * Gathers everything `runSeoAnalysis` needs from a document's current data — used both
 * server-side (computeScoreHook.ts, on the final saved `data`) and client-side (the live
 * analysis panel, on `useForm().getData()`), so both always agree on what "the content" is.
 *
 * Posts keep their body in a single `content` richText field. Pages spread it across the Hero's
 * richText and the `layout` blocks array. Both collections' FAQ tab (custom questions and/or
 * imported shared FAQs) renders on the page too, but imported FAQs are a relationship this
 * function can't resolve without a populated doc, so only inline FAQ items are included here —
 * a reasonable approximation, not a source of truth for FAQ content itself.
 */
export function buildSeoAnalysisInput(
  doc: SeoDocShape,
  collection: 'pages' | 'posts',
): Omit<SeoAnalysisInput, 'usedElsewhereCount'> {
  const sources: unknown[] =
    collection === 'posts' ? [doc.content, doc.faq?.items] : [doc.hero?.richText, doc.layout, doc.faq?.items]

  return {
    body: extractBodyContent(sources),
    focusKeyword: doc.meta?.focusKeyword,
    metaDescription: doc.meta?.description,
    metaTitle: doc.meta?.title,
    slug: doc.slug,
    title: doc.title,
  }
}
