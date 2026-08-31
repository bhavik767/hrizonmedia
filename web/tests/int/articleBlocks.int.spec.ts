import type { Payload, RequiredDataFromCollectionSlug } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

// Revalidation hooks call `revalidatePath`, which is unavailable outside a Next request.
const disableRevalidate = { context: { disableRevalidate: true } }

const SLUG = 'int-article-blocks'

let payload: Payload

/**
 * The Author's two new tools, at the collection seam: whatever they write into
 * an Article has to survive the round trip to the database and back. A block
 * the editor accepts but the collection strips is a silent loss of work.
 */
describe('An Article carrying Key takeaways and FAQ blocks', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await remove()
  })

  afterAll(async () => {
    await remove()
  })

  it('accepts both blocks and returns them intact', async () => {
    const created = await payload.create({
      collection: 'posts',
      data: {
        content: content(),
        slug: SLUG,
        title: 'An Article carrying both new blocks',
      },
      ...disableRevalidate,
    })

    const read = await payload.findByID({ collection: 'posts', id: created.id })
    const blocks = (read.content.root.children as Array<Record<string, any>>).filter(
      (node) => node.type === 'block',
    )

    expect(blocks.map((node) => node.fields.blockType)).toEqual(['keyTakeaways', 'faq'])

    const [takeaways, faq] = blocks

    expect(takeaways!.fields.heading).toBe('Key takeaways')
    expect(takeaways!.fields.takeaways.map((row: { statement: string }) => row.statement)).toEqual([
      'Encryption alone is not DRM, because the key is not protected.',
      'Watermarking does not prevent a leak; it names whoever leaked it.',
    ])

    expect(faq!.fields.heading).toBe('Frequently asked questions')
    expect(faq!.fields.questions).toHaveLength(1)
    expect(faq!.fields.questions[0].question).toBe('Does AES-128 count as DRM?')
    expect(faq!.fields.questions[0].answer.root.children[0].children[0].text).toBe(
      'No. The key travels to the browser in the clear.',
    )
  })
})

async function remove(): Promise<void> {
  await payload.delete({
    collection: 'posts',
    where: { slug: { equals: SLUG } },
    ...disableRevalidate,
  })
}

/* ---------- the lexical shapes the editor produces ---------- */

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

function paragraph(value: string) {
  return {
    type: 'paragraph',
    children: [text(value)],
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    version: 1,
  }
}

function doc(children: unknown[]) {
  return {
    root: { type: 'root', children, direction: 'ltr', format: '', indent: 0, version: 1 },
  }
}

function block(fields: Record<string, unknown>) {
  return { type: 'block', fields: { blockName: '', ...fields }, format: '', version: 2 }
}

function content(): RequiredDataFromCollectionSlug<'posts'>['content'] {
  return doc([
    paragraph('A lede, so the Article is not only its blocks.'),
    block({
      blockType: 'keyTakeaways',
      heading: 'Key takeaways',
      takeaways: [
        { statement: 'Encryption alone is not DRM, because the key is not protected.' },
        { statement: 'Watermarking does not prevent a leak; it names whoever leaked it.' },
      ],
    }),
    block({
      blockType: 'faq',
      heading: 'Frequently asked questions',
      questions: [
        {
          question: 'Does AES-128 count as DRM?',
          answer: doc([paragraph('No. The key travels to the browser in the clear.')]),
        },
      ],
    }),
  ]) as RequiredDataFromCollectionSlug<'posts'>['content']
}
