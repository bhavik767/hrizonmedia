import type { Field } from 'payload'

export const focusKeywordField = (): Field => ({
  name: 'focusKeyword',
  type: 'text',
  admin: {
    description:
      'The primary keyword or phrase you want this content to rank for. Drives the SEO analysis below — leave it blank to skip analysis.',
  },
  label: 'Focus Keyword',
})

export const seoScoreField = (): Field => ({
  name: 'seoScore',
  type: 'number',
  admin: {
    components: {
      Cell: '@/fields/seoAnalysis/ScoreCell#SeoScoreCell',
    },
    // Computed automatically by a beforeChange hook (see src/utilities/seo/computeScoreHook.ts)
    // every time the document is saved — the SEO Analysis panel above is the live, editable
    // view of the same thing, so this field is just its saved snapshot for the list view + API.
    description: 'Automatically computed on save. Powers the SEO column in the list view.',
    readOnly: true,
  },
  label: 'SEO Score',
})

export const seoAnalysisPanelField = (collection: 'pages' | 'posts'): Field => ({
  name: 'seoAnalysis',
  type: 'ui',
  admin: {
    components: {
      Field: {
        clientProps: { collection },
        path: '@/fields/seoAnalysis/Component#SeoAnalysisPanel',
      },
    },
  },
  label: 'SEO Analysis',
})
