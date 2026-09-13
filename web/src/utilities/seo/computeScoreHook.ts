import type { CollectionBeforeChangeHook } from 'payload'

import { runSeoAnalysis } from './analyze'
import { buildSeoAnalysisInput, type SeoDocShape } from './buildInput'

/**
 * Recomputes `meta.seoScore` (0-100) on every save, so the admin list view's SEO column always
 * reflects the saved document rather than whatever was last open in an editor tab. Mirrors the
 * live client panel (fields/seoAnalysis/Component.tsx) exactly — both call `runSeoAnalysis` with
 * an input built by the same `buildSeoAnalysisInput`, so the number an editor sees while typing
 * matches what lands in the database.
 *
 * Runs as a *collection*-level `beforeChange` hook, which fires before the `slug` field's own
 * auto-generation hook (a field-level `beforeChange`) — in the ordinary case that's harmless
 * since the admin UI's slug field already mirrors the title client-side before submit, but on an
 * API-only create with no slug supplied, this save's "keyword in URL" check may lag by one save
 * until the slug exists. Not worth reordering the hooks over.
 */
export const computeSeoScoreHook = (collection: 'pages' | 'posts'): CollectionBeforeChangeHook => {
  return async ({ data, originalDoc, req }) => {
    if (!data) return data

    const focusKeyword = (data.meta?.focusKeyword ?? '').trim()
    const currentId = originalDoc?.id

    let usedElsewhereCount: number | undefined

    if (focusKeyword) {
      const result = await req.payload.find({
        collection,
        depth: 0,
        limit: 0,
        overrideAccess: true,
        req,
        where: {
          and: [
            { 'meta.focusKeyword': { equals: focusKeyword } },
            ...(currentId ? [{ id: { not_equals: currentId } }] : []),
          ],
        },
      })
      usedElsewhereCount = result.totalDocs
    }

    const input = buildSeoAnalysisInput(data as SeoDocShape, collection)
    const { score } = runSeoAnalysis({ ...input, usedElsewhereCount })

    data.meta = {
      ...(typeof data.meta === 'object' && data.meta !== null ? data.meta : {}),
      seoScore: score,
    }

    return data
  }
}
