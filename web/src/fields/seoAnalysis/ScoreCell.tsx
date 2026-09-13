'use client'

import type { DefaultCellComponentProps } from 'payload'

import React from 'react'

import type { Rating } from '@/utilities/seo/types'

const ratingOf = (score: null | number | undefined): Rating => {
  if (score === null || score === undefined) return 'none'
  if (score >= 80) return 'good'
  if (score >= 50) return 'ok'
  return 'bad'
}

const RATING_COPY: Record<Rating, { color: string; label: string }> = {
  bad: { color: '#dc2626', label: 'Poor' },
  good: { color: '#16a34a', label: 'Good' },
  none: { color: '#9ca3af', label: 'Not set' },
  ok: { color: '#d97706', label: 'Moderate' },
}

// The list-view column for `meta.seoScore` (see src/fields/seoAnalysis/index.ts's
// seoScoreField, and Posts/Pages' `defaultColumns`). Mirrors the same Good/Moderate/Poor
// buckets as runSeoAnalysis (src/utilities/seo/analyze.ts) so the dot color here always matches
// what the document's own SEO Analysis panel showed when it was last saved.
export const SeoScoreCell: React.FC<DefaultCellComponentProps> = ({ cellData }) => {
  const score = typeof cellData === 'number' ? cellData : null
  const rating = RATING_COPY[ratingOf(score)]

  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
      <span
        style={{
          background: rating.color,
          borderRadius: '50%',
          display: 'inline-block',
          flexShrink: 0,
          height: 8,
          width: 8,
        }}
      />
      <span>{score === null ? rating.label : `${rating.label} (${score})`}</span>
    </div>
  )
}
