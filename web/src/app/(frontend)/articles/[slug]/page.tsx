import type { Metadata } from 'next'

import { RelatedPosts } from '@/blocks/RelatedPosts/Component'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { draftMode } from 'next/headers'
import React, { cache } from 'react'
import RichText from '@/components/RichText'

import type { Post } from '@/payload-types'

import { ArticleContents, ArticleContentsDisclosure } from '@/components/ArticleContents'
import { AuthorBiography } from '@/components/AuthorBiography'
import { EmailCapture } from '@/components/EmailCapture'
import { PostHero } from '@/heros/PostHero'
import { articleHeadings } from '@/utilities/articleHeadings'
import { generateMeta } from '@/utilities/generateMeta'
import { LivePreviewListener } from '@/components/LivePreviewListener'

// Content is fetched from Payload only at runtime, where Railway provides the database and secret.
export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const posts = await payload.find({
    collection: 'posts',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    pagination: false,
    select: {
      slug: true,
    },
  })

  const params = posts.docs.map(({ slug }) => {
    return { slug }
  })

  return params
}

type Args = {
  params: Promise<{
    slug?: string
  }>
}

export default async function Post({ params: paramsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { slug = '' } = await paramsPromise
  // Decode to support slugs with special characters
  const decodedSlug = decodeURIComponent(slug)
  const url = '/articles/' + decodedSlug
  const post = await queryPostBySlug({ slug: decodedSlug })

  if (!post) return <PayloadRedirects url={url} />

  const headings = articleHeadings(post.content)

  return (
    <article className="pb-20">
      {/* Allows redirects for valid pages too */}
      <PayloadRedirects disableNotFound url={url} />

      {draft && <LivePreviewListener />}

      <PostHero post={post} />

      {/*
        The body takes the primary column and the contents the secondary one.
        The rail is sticky so a reader can leave for another section from any
        point in a long piece without scrolling back to the top.
      */}
      <div className="container pt-12">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-12 xl:gap-16">
          <div>
            <ArticleContentsDisclosure className="lg:hidden" headings={headings} />

            {/*
              `enableGutter={false}` sets `max-w-none`, which would otherwise
              undo the 65-character measure the prose styles set.
            */}
            <RichText className="max-w-[65ch]" data={post.content} enableGutter={false} />

            {/*
              And again where the body ends, so a reader who was convinced by
              the whole piece does not have to scroll back to act on it.
            */}
            <EmailCapture className="mt-12 max-w-[65ch]" />
          </div>

          {/*
            The contents first, then the site's one ask beneath it, so a reader
            can act at the moment they are convinced without leaving the piece.
          */}
          <aside className="hidden lg:block lg:sticky lg:top-24">
            <ArticleContents headings={headings} />

            <EmailCapture className="mt-8" />
          </aside>
        </div>
      </div>

      <AuthorBiography />

      {post.relatedPosts && post.relatedPosts.length > 0 && (
        <div className="container pt-16">
          <RelatedPosts docs={post.relatedPosts.filter((post) => typeof post === 'object')} />
        </div>
      )}
    </article>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug = '' } = await paramsPromise
  // Decode to support slugs with special characters
  const decodedSlug = decodeURIComponent(slug)
  const post = await queryPostBySlug({ slug: decodedSlug })

  return generateMeta({ doc: post })
}

const queryPostBySlug = cache(async ({ slug }: { slug: string }) => {
  const { isEnabled: draft } = await draftMode()

  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'posts',
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: {
      slug: {
        equals: slug,
      },
    },
  })

  return result.docs?.[0] || null
})
