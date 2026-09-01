import { getPayload, type Payload, type RequiredDataFromCollectionSlug } from 'payload'

import config from '../../src/payload.config.js'

// Revalidation hooks call `revalidatePath`, which is unavailable outside a Next request.
const disableRevalidate = { context: { disableRevalidate: true } }

/**
 * Enough Articles to fill more than one page of the listing, so pagination has
 * somewhere to paginate to. The listing shows twelve, so thirteen guarantees a
 * second page whatever else the suite has left in the collection.
 *
 * They are deliberately minimal — the listing shows a title and a line of
 * supporting detail, and nothing here is about how an Article reads.
 */
export const listingArticlesFixture = {
  count: 13,
  /** The words the first Article links to the second one with. */
  crossLinkText: 'the next listing Article',
  slugPrefix: 'test-listing-article-',
  titlePrefix: 'Test Listing Article ',
}

export const listingArticleTitle = (index: number): string =>
  `${listingArticlesFixture.titlePrefix}${index}`

export async function seedListingArticles(): Promise<void> {
  const payload = await getPayload({ config })

  await deleteFixture({ payload })

  const created: number[] = []

  for (let index = 1; index <= listingArticlesFixture.count; index++) {
    const article = await payload.create({
      collection: 'posts',
      data: {
        _status: 'published',
        content: doc(`One line about listing Article ${index}.`),
        meta: { description: `What listing Article ${index} is about, in one line.` },
        publishedAt: new Date(`2026-03-${String(index).padStart(2, '0')}T09:00:00.000Z`).toISOString(),
        slug: `${listingArticlesFixture.slugPrefix}${index}`,
        title: listingArticleTitle(index),
      },
      ...disableRevalidate,
    })

    created.push(article.id)
  }

  /*
   * The first one links to the second from inside its body, so the address an
   * Author writes into a sentence is covered too and not only the ones the
   * templates build.
   */
  await payload.update({
    collection: 'posts',
    id: created[0],
    data: { content: docLinkingTo(created[1]) },
    ...disableRevalidate,
  })
}

export async function cleanupListingArticles(): Promise<void> {
  await deleteFixture({ payload: await getPayload({ config }) })
}

async function deleteFixture({ payload }: { payload: Payload }): Promise<void> {
  await payload.delete({
    collection: 'posts',
    where: { slug: { like: listingArticlesFixture.slugPrefix } },
    ...disableRevalidate,
  })
}

function docLinkingTo(id: number): RequiredDataFromCollectionSlug<'posts'>['content'] {
  return paragraphDoc([
    text('Carry on with '),
    {
      type: 'link',
      children: [text(listingArticlesFixture.crossLinkText)],
      direction: 'ltr',
      fields: {
        doc: { relationTo: 'posts', value: id },
        linkType: 'internal',
        newTab: false,
      },
      format: '',
      indent: 0,
      version: 3,
    },
    text('.'),
  ])
}

const text = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

function doc(value: string): RequiredDataFromCollectionSlug<'posts'>['content'] {
  return paragraphDoc([text(value)])
}

function paragraphDoc(children: unknown[]): RequiredDataFromCollectionSlug<'posts'>['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children,
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
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
