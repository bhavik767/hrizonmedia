'use client'

import { useRowLabel } from '@payloadcms/ui'

export const RowLabel = () => {
  const { data, rowNumber } = useRowLabel<{ question?: string }>()

  return data?.question || `Question ${String(rowNumber ?? 1).padStart(2, '0')}`
}
