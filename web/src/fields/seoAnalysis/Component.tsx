'use client'

import { useAllFormFields, useDocumentInfo, useForm } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import { runSeoAnalysis } from '@/utilities/seo/analyze'
import { buildSeoAnalysisInput, type SeoDocShape } from '@/utilities/seo/buildInput'
import type { CheckStatus, Rating, SeoAnalysisResult } from '@/utilities/seo/types'

const STATUS_COLOR: Record<CheckStatus, string> = {
  bad: '#dc2626',
  good: '#16a34a',
  neutral: '#9ca3af',
  ok: '#d97706',
  skipped: '#9ca3af',
}

const RATING_COPY: Record<Rating, { color: string; label: string }> = {
  bad: { color: '#dc2626', label: 'Poor SEO' },
  good: { color: '#16a34a', label: 'Good SEO' },
  none: { color: '#9ca3af', label: 'Add a focus keyword to see your SEO score' },
  ok: { color: '#d97706', label: 'Needs improvement' },
}

type Props = {
  collection: 'pages' | 'posts'
}

/**
 * The Yoast-style "SEO analysis" panel: a live traffic-light checklist that recomputes as the
 * editor types, using the exact same `runSeoAnalysis` logic that computeScoreHook.ts runs on
 * save (see src/utilities/seo/analyze.ts) — so what's shown here never disagrees with the score
 * stored in `meta.seoScore` once the document is saved.
 *
 * Two things happen client-side that don't happen server-side: (1) recompute is debounced, since
 * `useAllFormFields` re-renders on every keystroke anywhere in the document, and (2) the
 * "focus keyword used elsewhere" check needs a lookup, done here via the REST API (the save-time
 * hook uses the faster Local API directly instead).
 */
export const SeoAnalysisPanel: React.FC<Props> = ({ collection }) => {
  const [fields] = useAllFormFields()
  const { getData } = useForm()
  const { id: docId } = useDocumentInfo()

  const focusKeyword = String(fields?.['meta.focusKeyword']?.value ?? '').trim()

  const [usedElsewhereCount, setUsedElsewhereCount] = useState<number | undefined>(undefined)

  const [result, setResult] = useState<SeoAnalysisResult>(() => {
    // `getData()` returns the form's current nested value in the same shape as the saved
    // document (Payload reduces array/blocks field state to real arrays here), so this is a
    // straight cast rather than a re-derivation of the document shape.
    const data = getData() as unknown as SeoDocShape
    return runSeoAnalysis({ ...buildSeoAnalysisInput(data, collection), usedElsewhereCount: undefined })
  })

  // Recompute shortly after fields settle, rather than on every keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const data = getData() as unknown as SeoDocShape
      setResult(runSeoAnalysis({ ...buildSeoAnalysisInput(data, collection), usedElsewhereCount }))
    }, 400)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, usedElsewhereCount])

  // Look up how many *other* documents already use this focus keyword, debounced.
  useEffect(() => {
    if (!focusKeyword) {
      setUsedElsewhereCount(undefined)
      return
    }

    let cancelled = false
    const timeout = setTimeout(() => {
      const params = new URLSearchParams()
      params.set('where[and][0][meta.focusKeyword][equals]', focusKeyword)
      if (docId) params.set('where[and][1][id][not_equals]', String(docId))
      params.set('limit', '0')
      params.set('depth', '0')

      fetch(`/api/${collection}?${params.toString()}`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!cancelled && json && typeof json.totalDocs === 'number') {
            setUsedElsewhereCount(json.totalDocs)
          }
        })
        .catch(() => {
          // Best-effort only. Leaving usedElsewhereCount alone keeps whatever state (including
          // "checking…") was already shown rather than claiming a false answer.
        })
    }, 600)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [focusKeyword, docId, collection])

  const rating = RATING_COPY[result.rating]

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 4,
        marginBottom: 20,
        padding: 16,
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 12 }}>
        <span
          style={{
            background: rating.color,
            borderRadius: '50%',
            display: 'inline-block',
            flexShrink: 0,
            height: 12,
            width: 12,
          }}
        />
        <strong>{rating.label}</strong>
        {result.score !== null && (
          <span style={{ color: 'var(--theme-elevation-500)', fontSize: 13 }}>
            Score: {result.score}/100
          </span>
        )}
      </div>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
        {result.checks.map((check) => (
          <li key={check.id} style={{ alignItems: 'flex-start', display: 'flex', gap: 8 }}>
            <span
              style={{
                background: STATUS_COLOR[check.status],
                borderRadius: '50%',
                flexShrink: 0,
                height: 8,
                marginTop: 5,
                width: 8,
              }}
            />
            <span>
              <strong style={{ display: 'block', fontSize: 13 }}>{check.label}</strong>
              <span style={{ color: 'var(--theme-elevation-500)', fontSize: 13 }}>{check.message}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
