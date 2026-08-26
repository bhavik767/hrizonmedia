import type { Payload, RequiredDataFromCollectionSlug } from 'payload'

import { getPayload } from 'payload'

import config from '../../src/payload.config.js'

// Revalidation hooks call `revalidatePath`, which is unavailable outside a Next request.
const disableRevalidate = { context: { disableRevalidate: true } }

export const brandArticleFixture = {
  headingText: 'How a licence exchange works',
  linkText: 'read the multi-DRM primer',
  paragraphText: 'Encryption alone is not DRM, because the key is not protected.',
  slug: 'test-brand-foundation-article',
  subheadingText: 'Widevine, FairPlay and PlayReady',
  title: 'Test Article For The Brand Foundation',
}

/**
 * A published Article carrying the elements the brand tokens have to hold:
 * body copy, a link inside prose, and a heading at each of the two levels the
 * type scale defines. Nothing about its wording matters — it exists so the
 * computed styles have something real to be computed against.
 */
export async function seedBrandArticle(): Promise<void> {
  const payload = await getPayload({ config })

  await deleteFixture({ payload })

  await payload.create({
    collection: 'posts',
    data: {
      _status: 'published',
      content: buildContent(),
      slug: brandArticleFixture.slug,
      title: brandArticleFixture.title,
    },
    ...disableRevalidate,
  })
}

export async function cleanupBrandArticle(): Promise<void> {
  const payload = await getPayload({ config })

  await deleteFixture({ payload })
}

async function deleteFixture({ payload }: { payload: Payload }): Promise<void> {
  await payload.delete({
    collection: 'posts',
    where: { slug: { equals: brandArticleFixture.slug } },
    ...disableRevalidate,
  })
}

function text(value: string) {
  return {
    type: 'text' as const,
    detail: 0,
    format: 0,
    mode: 'normal' as const,
    style: '',
    text: value,
    version: 1,
  }
}

function heading(tag: 'h2' | 'h3', value: string) {
  return {
    type: 'heading',
    children: [text(value)],
    direction: 'ltr',
    format: '',
    indent: 0,
    tag,
    version: 1,
  }
}

function buildContent(): RequiredDataFromCollectionSlug<'posts'>['content'] {
  return {
    root: {
      type: 'root',
      children: [
        heading('h2', brandArticleFixture.headingText),
        {
          type: 'paragraph',
          children: [
            text(`${brandArticleFixture.paragraphText} `),
            {
              type: 'link',
              children: [text(brandArticleFixture.linkText)],
              direction: 'ltr',
              fields: { linkType: 'custom', newTab: false, url: '/' },
              format: '',
              indent: 0,
              version: 3,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          version: 1,
        },
        heading('h3', brandArticleFixture.subheadingText),
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  } as RequiredDataFromCollectionSlug<'posts'>['content']
}
