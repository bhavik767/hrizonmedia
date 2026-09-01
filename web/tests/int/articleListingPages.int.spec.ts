import type { Payload, RequiredDataFromCollectionSlug } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { ARTICLES_PER_PAGE } from '@/utilities/routes'
import { generateStaticParams } from '@/app/(frontend)/articles/page/[pageNumber]/page'

// Revalidation hooks call `revalidatePath`, which is unavailable outside a Next request.
const disableRevalidate = { context: { disableRevalidate: true } }

const SLUG_PREFIX = 'int-listing-pages'

// One short of a second page at a size of 12, but two pages at a size of 10 —
// the smallest count at which the two divisors disagree.
const SEEDED = 11

let payload: Payload

/**
 * Which paginated listing addresses get prerendered.
 *
 * `generateStaticParams` decides that at build time, and it has to agree with
 * the page size the listing actually fetches. When it disagrees the build
 * prerenders addresses the listing will never fill — a real, served, empty
 * page — or misses ones that hold Articles.
 */
describe('The prerendered Article listing pages', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await remove()

    for (let i = 1; i <= SEEDED; i++) {
      await payload.create({
        collection: 'posts',
        data: {
          _status: 'published',
          content: content(),
          slug: `${SLUG_PREFIX}-${i}`,
          title: `Listing page fixture ${i}`,
        },
        ...disableRevalidate,
      })
    }
  })

  afterAll(async () => {
    await remove()
  })

  it('prerenders no page the listing cannot fill', async () => {
    const params = await generateStaticParams()

    for (const { pageNumber } of params) {
      const page = await payload.find({
        collection: 'posts',
        limit: ARTICLES_PER_PAGE,
        page: Number(pageNumber),
        overrideAccess: false,
      })

      expect(page.docs.length, `page ${pageNumber} was prerendered but holds no Articles`).
        toBeGreaterThan(0)
    }
  })

  it('prerenders every page that holds Articles', async () => {
    const params = await generateStaticParams()

    const { totalPages } = await payload.find({
      collection: 'posts',
      limit: ARTICLES_PER_PAGE,
      overrideAccess: false,
    })

    expect(params.map(({ pageNumber }) => pageNumber)).toEqual(
      Array.from({ length: totalPages }, (_, i) => String(i + 1)),
    )
  })
})

async function remove(): Promise<void> {
  await payload.delete({
    collection: 'posts',
    where: { slug: { like: SLUG_PREFIX } },
    ...disableRevalidate,
  })
}

/* ---------- the minimal lexical shape the editor produces ---------- */

function content(): RequiredDataFromCollectionSlug<'posts'>['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: 'A fixture Article, present only to fill a listing page.',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  } as RequiredDataFromCollectionSlug<'posts'>['content']
}
