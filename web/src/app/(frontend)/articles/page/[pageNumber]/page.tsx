import type { Metadata } from 'next/types'

import configPromise from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { ArticleListing } from '@/components/ArticleListing'
import { CATEGORY_PARAM, articleListingPageCount } from '@/utilities/routes'
import PageClient from './page.client'

export const revalidate = 600

type Args = {
  params: Promise<{
    pageNumber: string
  }>
  searchParams: Promise<{ [CATEGORY_PARAM]?: string }>
}

export default async function Page({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: Args) {
  const { pageNumber } = await paramsPromise
  const { [CATEGORY_PARAM]: category } = await searchParamsPromise

  const sanitizedPageNumber = Number(pageNumber)

  if (!Number.isInteger(sanitizedPageNumber)) notFound()

  return (
    <>
      <PageClient />
      <ArticleListing category={category} pageNumber={sanitizedPageNumber} />
    </>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { pageNumber } = await paramsPromise
  return {
    title: `EncryptStream Articles Page ${pageNumber || ''}`,
  }
}

/*
 * Which paginated addresses are prerendered. The unfiltered listing is the one
 * worth building: a narrowed one is a query string, and there is no page count
 * to enumerate for a filter a reader may or may not use.
 */
export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const { totalDocs } = await payload.count({
    collection: 'posts',
    overrideAccess: false,
  })

  const totalPages = articleListingPageCount(totalDocs)

  const pages: { pageNumber: string }[] = []

  for (let i = 1; i <= totalPages; i++) {
    pages.push({ pageNumber: String(i) })
  }

  return pages
}
