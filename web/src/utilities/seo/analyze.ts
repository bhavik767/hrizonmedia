import type { CheckResult, CheckStatus, Rating, SeoAnalysisInput, SeoAnalysisResult } from './types'

// A single source of truth for the Yoast-style checks, their relative importance (weight), and
// how a numeric 0-100 score buckets into the Good / Moderate / Poor traffic light. Used by both
// the server-side beforeChange hook (computeScoreHook.ts, which stores `meta.seoScore` for the
// admin list column) and the live client panel (fields/seoAnalysis/Component.tsx) — so the
// number an editor sees while typing always matches what gets saved.

type Check = {
  /** Keyword-dependent checks are skipped entirely (not scored) until a focus keyword is set. */
  evaluate: (input: SeoAnalysisInput) => { message: string; status: CheckStatus }
  id: string
  keywordDependent: boolean
  label: string
  weight: number
}

const normalize = (value: null | string | undefined): string => (value ?? '').trim().toLowerCase()

const includesKeyword = (haystack: null | string | undefined, keyword: string): boolean =>
  normalize(haystack).includes(keyword)

const round1 = (n: number): string => (Math.round(n * 10) / 10).toString()

const checks: Check[] = [
  {
    id: 'keywordInTitle',
    keywordDependent: true,
    label: 'Focus keyword in SEO title',
    weight: 2,
    evaluate: ({ focusKeyword, metaTitle }) => {
      const keyword = normalize(focusKeyword)
      return includesKeyword(metaTitle, keyword)
        ? { message: 'Your SEO title contains the focus keyword.', status: 'good' }
        : { message: 'The focus keyword does not appear in your SEO title.', status: 'bad' }
    },
  },
  {
    id: 'keywordInMetaDescription',
    keywordDependent: true,
    label: 'Focus keyword in meta description',
    weight: 2,
    evaluate: ({ focusKeyword, metaDescription }) => {
      const keyword = normalize(focusKeyword)
      return includesKeyword(metaDescription, keyword)
        ? { message: 'Your meta description contains the focus keyword.', status: 'good' }
        : {
            message: 'The focus keyword does not appear in your meta description.',
            status: 'bad',
          }
    },
  },
  {
    id: 'keywordInSlug',
    keywordDependent: true,
    label: 'Focus keyword in URL',
    weight: 1.5,
    evaluate: ({ focusKeyword, slug }) => {
      const keyword = normalize(focusKeyword)
      const readableSlug = normalize(slug).replace(/[-_]+/g, ' ')
      return readableSlug.includes(keyword)
        ? { message: 'Your URL slug contains the focus keyword.', status: 'good' }
        : { message: 'The focus keyword does not appear in your URL slug.', status: 'ok' }
    },
  },
  {
    id: 'keywordInH1',
    keywordDependent: true,
    label: 'Focus keyword in H1 (title)',
    weight: 2,
    evaluate: ({ focusKeyword, title }) => {
      const keyword = normalize(focusKeyword)
      return includesKeyword(title, keyword)
        ? { message: 'Your title (rendered as the page H1) contains the focus keyword.', status: 'good' }
        : { message: 'The focus keyword does not appear in your title.', status: 'bad' }
    },
  },
  {
    id: 'keywordInSubheading',
    keywordDependent: true,
    label: 'Focus keyword in a subheading',
    weight: 1.5,
    evaluate: ({ body, focusKeyword }) => {
      const keyword = normalize(focusKeyword)
      const found = body.headings.some(
        (heading) => heading.tag !== 'h1' && normalize(heading.text).includes(keyword),
      )
      return found
        ? { message: 'At least one subheading (H2-H4) contains the focus keyword.', status: 'good' }
        : {
            message: 'None of your subheadings (H2-H4) contain the focus keyword.',
            status: 'ok',
          }
    },
  },
  {
    id: 'keywordInIntroduction',
    keywordDependent: true,
    label: 'Focus keyword in introduction',
    weight: 1.5,
    evaluate: ({ body, focusKeyword }) => {
      const keyword = normalize(focusKeyword)
      const introWords = body.plainText.trim().split(/\s+/).slice(0, 120).join(' ')
      return normalize(introWords).includes(keyword)
        ? { message: 'The focus keyword appears early in your content.', status: 'good' }
        : {
            message: 'The focus keyword does not appear in the first ~120 words.',
            status: 'ok',
          }
    },
  },
  {
    id: 'keywordDensity',
    keywordDependent: true,
    label: 'Keyword density',
    weight: 2,
    evaluate: ({ body, focusKeyword }) => {
      const keyword = normalize(focusKeyword)
      if (body.wordCount === 0) {
        return { message: 'There is no content yet to measure keyword density.', status: 'bad' }
      }

      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const matches = normalize(body.plainText).match(new RegExp(escaped, 'g'))
      const occurrences = matches ? matches.length : 0
      const density = (occurrences / body.wordCount) * 100

      if (occurrences === 0) {
        return { message: 'The focus keyword does not appear in the content at all.', status: 'bad' }
      }
      if (density < 0.5) {
        return {
          message: `Keyword density is ${round1(density)}% — a little low. Aim for 0.5-3%.`,
          status: 'ok',
        }
      }
      if (density > 3) {
        return {
          message: `Keyword density is ${round1(density)}% — this may read as keyword stuffing.`,
          status: 'ok',
        }
      }
      return {
        message: `Keyword density is ${round1(density)}%, within the recommended 0.5-3% range.`,
        status: 'good',
      }
    },
  },
  {
    id: 'contentLength',
    keywordDependent: false,
    label: 'Content length',
    weight: 2,
    evaluate: ({ body }) => {
      if (body.wordCount < 300) {
        return {
          message: `Only ${body.wordCount} words. Aim for at least 300 for solid SEO value.`,
          status: 'bad',
        }
      }
      if (body.wordCount < 600) {
        return {
          message: `${body.wordCount} words — decent, but 600+ tends to perform better.`,
          status: 'ok',
        }
      }
      return { message: `${body.wordCount} words — a good, substantial length.`, status: 'good' }
    },
  },
  {
    id: 'internalLinks',
    keywordDependent: false,
    label: 'Internal links',
    weight: 1,
    evaluate: ({ body }) => {
      const count = body.links.filter((link) => link.internal).length
      return count > 0
        ? { message: `${count} internal link${count === 1 ? '' : 's'} found.`, status: 'good' }
        : { message: 'No internal links found. Consider linking to related content.', status: 'ok' }
    },
  },
  {
    id: 'externalLinks',
    keywordDependent: false,
    label: 'External (outbound) links',
    weight: 1,
    evaluate: ({ body }) => {
      const count = body.links.filter((link) => !link.internal).length
      return count > 0
        ? { message: `${count} outbound link${count === 1 ? '' : 's'} found.`, status: 'good' }
        : {
            message: 'No outbound links found. Linking to a relevant, authoritative source can help.',
            status: 'ok',
          }
    },
  },
  {
    id: 'imageAlt',
    keywordDependent: true,
    label: 'Focus keyword in image alt text',
    weight: 1,
    evaluate: ({ body, focusKeyword }) => {
      const keyword = normalize(focusKeyword)
      if (body.images.length === 0) {
        return {
          message: 'No images found. Adding one with descriptive alt text can help.',
          status: 'ok',
        }
      }
      const found = body.images.some((image) => normalize(image.alt).includes(keyword))
      return found
        ? { message: 'At least one image has the focus keyword in its alt text.', status: 'good' }
        : {
            message: 'None of your images have the focus keyword in their alt text.',
            status: 'ok',
          }
    },
  },
  {
    id: 'keywordUsedElsewhere',
    keywordDependent: true,
    label: 'Focus keyword usage elsewhere',
    weight: 1,
    evaluate: ({ usedElsewhereCount }) => {
      if (usedElsewhereCount === undefined) {
        return { message: 'Checking whether this keyword is used elsewhere…', status: 'neutral' }
      }
      if (usedElsewhereCount > 0) {
        return {
          message: `This focus keyword is already used on ${usedElsewhereCount} other document${usedElsewhereCount === 1 ? '' : 's'}. Consider something more specific.`,
          status: 'ok',
        }
      }
      return { message: "This focus keyword isn't used anywhere else yet.", status: 'good' }
    },
  },
]

const scoreOf = (status: CheckStatus): number => {
  if (status === 'good') return 1
  if (status === 'ok' || status === 'neutral') return 0.5
  return 0
}

const ratingOf = (score: number): Rating => {
  if (score >= 80) return 'good'
  if (score >= 50) return 'ok'
  return 'bad'
}

export function runSeoAnalysis(input: SeoAnalysisInput): SeoAnalysisResult {
  const hasKeyword = normalize(input.focusKeyword).length > 0

  const results: CheckResult[] = checks.map((check) => {
    if (check.keywordDependent && !hasKeyword) {
      return {
        id: check.id,
        label: check.label,
        message: 'Add a focus keyword above to run this check.',
        status: 'skipped',
      }
    }

    const { message, status } = check.evaluate(input)
    return { id: check.id, label: check.label, message, status }
  })

  if (!hasKeyword) {
    return { checks: results, rating: 'none', score: null }
  }

  const scored = checks.filter((check) => results.find((r) => r.id === check.id)?.status !== 'skipped')
  const totalWeight = scored.reduce((sum, check) => sum + check.weight, 0)
  const earnedWeight = scored.reduce((sum, check) => {
    const result = results.find((r) => r.id === check.id)
    return sum + (result ? scoreOf(result.status) * check.weight : 0)
  }, 0)

  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

  return { checks: results, rating: ratingOf(score), score }
}
