import type { Metadata } from 'next/types'

import React from 'react'

import { ArticleListing } from '@/components/ArticleListing'
import { CATEGORY_PARAM } from '@/utilities/routes'

/*
 * Not `force-static`. The listing narrows to a category off the query string,
 * and a statically rendered page is handed no query string to read.
 */
export const revalidate = 600

type Args = {
  searchParams: Promise<{ [CATEGORY_PARAM]?: string }>
}

export default async function Page({ searchParams: searchParamsPromise }: Args) {
  const { [CATEGORY_PARAM]: category } = await searchParamsPromise

  return <ArticleListing category={category} />
}

export function generateMetadata(): Metadata {
  return {
    title: `EncryptStream Articles`,
  }
}
