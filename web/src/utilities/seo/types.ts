// Shared types for the Yoast-style SEO analysis. This module is imported both by the
// server-side `computeSeoScore` beforeChange hook (src/utilities/seo/computeScoreHook.ts) and
// by the client-side live analysis panel (src/fields/seoAnalysis/Component.tsx), so it must stay
// framework-agnostic (no Node-only or DOM-only APIs) — see extractContent.ts / analyze.ts.

export type CheckStatus = 'bad' | 'good' | 'neutral' | 'ok' | 'skipped'

export type CheckResult = {
  id: string
  label: string
  message: string
  status: CheckStatus
}

export type Rating = 'bad' | 'good' | 'none' | 'ok'

export type SeoAnalysisResult = {
  checks: CheckResult[]
  /** 0-100, or null when no focus keyword has been entered yet. */
  score: null | number
  rating: Rating
}

export type ExtractedHeading = {
  tag: string
  text: string
}

export type ExtractedLink = {
  internal: boolean
  text: string
}

export type ExtractedImage = {
  alt: string
}

export type ExtractedBody = {
  headings: ExtractedHeading[]
  images: ExtractedImage[]
  links: ExtractedLink[]
  plainText: string
  wordCount: number
}

export type SeoAnalysisInput = {
  body: ExtractedBody
  focusKeyword: null | string | undefined
  metaDescription: null | string | undefined
  metaTitle: null | string | undefined
  slug: null | string | undefined
  title: null | string | undefined
  /**
   * How many *other* documents in the same collection already use this focus keyword.
   * Undefined means "not checked yet" (e.g. the live client hasn't finished its lookup) —
   * distinct from 0, which means the check ran and found nothing.
   */
  usedElsewhereCount?: number
}
