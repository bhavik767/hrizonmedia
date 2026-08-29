import type { Payload, RequiredDataFromCollectionSlug } from 'payload'

import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import config from '../../src/payload.config.js'
import { categorySlug } from '../../src/endpoints/seed/articles.js'

// Revalidation hooks call `revalidatePath`, which is unavailable outside a Next request.
const disableRevalidate = { context: { disableRevalidate: true } }

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * One Article carrying every element the reading experience has to hold: a
 * category, a lede, headings at both contents levels, a pair of headings that
 * collide so anchor disambiguation has something to disambiguate, a level the
 * contents must ignore, a technical term set as code inside a sentence, a Key
 * takeaways box, two FAQ blocks — the second unheaded and repeating a question
 * from the first — and a related Article to close on.
 */
export const articlePageFixture = {
  /*
   * Its own category, not one of the three the site ships with. The fixture
   * deletes its category on the way out, and sharing a name with the launch
   * Articles would strip theirs on the next run.
   */
  category: 'Test category for the Article page',
  codeTerm: '#EXT-X-KEY',
  collidingHeading: 'What this actually costs',
  deepHeading: 'A level the contents ignores',
  /* The second FAQ block carries no heading and asks the first one's question again. */
  faqHeading: 'Questions about licences',
  faqRepeatedAnswer: 'Asked again, in a second cluster, so the anchors have to differ.',
  faqRepeatedQuestion: 'Does AES-128 count as DRM?',
  faqQuestions: [
    ['Does AES-128 count as DRM?', 'No. The key travels to the browser in the clear.'],
    [
      'Is one packaging pass enough for all three ecosystems?',
      'Yes, where the packaging is done once against a common encryption scheme.',
    ],
  ] as [string, string][],
  figureAlt: 'Widevine security levels, from L3 to L1',
  figureCaption: 'Source: Widevine device security levels, Google, 2025',
  ledeText: 'Encryption alone is not DRM, because the key is not protected.',
  relatedSlug: 'test-article-page-related',
  relatedTitle: 'Test Related Article For The Article Page',
  slug: 'test-article-page',
  subheadingText: 'Widevine, FairPlay and PlayReady',
  takeaways: [
    'A key that reaches the browser unprotected is not protected at all.',
    'Watermarking does not stop a leak; it names whoever leaked it.',
  ],
  takeawaysHeading: 'What this Article argues',
  title: 'Test Article For The Article Page',
  topHeading: 'How a licence exchange works',
}

export async function seedArticlePage(): Promise<void> {
  const payload = await getPayload({ config })

  await deleteFixture({ payload })

  const category = await payload.create({
    collection: 'categories',
    data: {
      slug: categorySlug(articlePageFixture.category),
      title: articlePageFixture.category,
    },
    ...disableRevalidate,
  })

  const figure = await payload.create({
    collection: 'media',
    data: {
      alt: articlePageFixture.figureAlt,
      caption: doc([paragraph(articlePageFixture.figureCaption)]),
    },
    filePath: path.resolve(dirname, '../../src/endpoints/seed/image-post1.webp'),
    ...disableRevalidate,
  })

  const related = await payload.create({
    collection: 'posts',
    data: {
      _status: 'published',
      categories: [category.id],
      content: doc([paragraph(articlePageFixture.ledeText)]),
      meta: { description: 'What the related Article is about, in one line.' },
      publishedAt: new Date('2026-01-05T09:00:00.000Z').toISOString(),
      slug: articlePageFixture.relatedSlug,
      title: articlePageFixture.relatedTitle,
    },
    ...disableRevalidate,
  })

  await payload.create({
    collection: 'posts',
    data: {
      _status: 'published',
      categories: [category.id],
      content: buildContent(figure.id),
      publishedAt: new Date('2026-02-11T09:00:00.000Z').toISOString(),
      relatedPosts: [related.id],
      slug: articlePageFixture.slug,
      title: articlePageFixture.title,
    },
    ...disableRevalidate,
  })
}

export async function cleanupArticlePage(): Promise<void> {
  const payload = await getPayload({ config })

  await deleteFixture({ payload })
}

async function deleteFixture({ payload }: { payload: Payload }): Promise<void> {
  await payload.delete({
    collection: 'posts',
    where: {
      slug: { in: [articlePageFixture.slug, articlePageFixture.relatedSlug] },
    },
    ...disableRevalidate,
  })
  await payload.delete({
    collection: 'media',
    where: { alt: { equals: articlePageFixture.figureAlt } },
    ...disableRevalidate,
  })
  await payload.delete({
    collection: 'categories',
    where: { title: { equals: articlePageFixture.category } },
    ...disableRevalidate,
  })
}

/** Lexical's bit for a run of text marked as code. */
const IS_CODE = 16

function text(value: string, format = 0) {
  return {
    type: 'text' as const,
    detail: 0,
    format,
    mode: 'normal' as const,
    style: '',
    text: value,
    version: 1,
  }
}

function heading(tag: 'h2' | 'h3' | 'h4', value: string) {
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

/** A paragraph that names a technical term, marked as code within the prose. */
function paragraphWithCode(before: string, code: string, after: string) {
  return {
    type: 'paragraph',
    children: [text(before), text(code, IS_CODE), text(after)],
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
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

function doc(children: unknown[]): RequiredDataFromCollectionSlug<'posts'>['content'] {
  return {
    root: {
      type: 'root',
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  } as RequiredDataFromCollectionSlug<'posts'>['content']
}

/**
 * Sections run long enough that the page scrolls, because an Article that fits
 * on one screen cannot exercise a contents that tracks the reading position.
 */
function section(body: string) {
  return Array.from({ length: 4 }, (_, index) => paragraph(`${body} (${index + 1})`))
}

function mediaBlock(mediaId: number | string) {
  return {
    type: 'block',
    fields: { blockName: '', blockType: 'mediaBlock', media: mediaId },
    format: '',
    version: 2,
  }
}

function keyTakeawaysBlock(heading: string, statements: string[]) {
  return {
    type: 'block',
    fields: {
      blockName: '',
      blockType: 'keyTakeaways',
      heading,
      takeaways: statements.map((statement) => ({ statement })),
    },
    format: '',
    version: 2,
  }
}

function faqBlock(heading: null | string, questions: [string, string][]) {
  return {
    type: 'block',
    fields: {
      blockName: '',
      blockType: 'faq',
      heading,
      questions: questions.map(([question, answer]) => ({
        answer: doc([paragraph(answer)]),
        question,
      })),
    },
    format: '',
    version: 2,
  }
}

function buildContent(
  figureId: number | string,
): RequiredDataFromCollectionSlug<'posts'>['content'] {
  return doc([
    paragraph(articlePageFixture.ledeText),
    keyTakeawaysBlock(articlePageFixture.takeawaysHeading, articlePageFixture.takeaways),
    heading('h2', articlePageFixture.topHeading),
    ...section('A licence exchange hands the client a key it never gets to keep.'),
    mediaBlock(figureId),
    heading('h3', articlePageFixture.subheadingText),
    paragraphWithCode(
      'The manifest names its key with a ',
      articlePageFixture.codeTerm,
      ' tag, which is where the difference between encryption and DRM shows.',
    ),
    ...section('Three ecosystems, one pipeline, if the packaging is done once.'),
    heading('h2', articlePageFixture.collidingHeading),
    ...section('Licence fees, packaging and the storage the encrypted renditions need.'),
    heading('h3', articlePageFixture.collidingHeading),
    ...section('The same words again, one level down, so the anchors have to differ.'),
    heading('h4', articlePageFixture.deepHeading),
    ...section('Below the two levels the contents is derived from.'),
    faqBlock(articlePageFixture.faqHeading, articlePageFixture.faqQuestions),
    faqBlock(null, [
      [articlePageFixture.faqRepeatedQuestion, articlePageFixture.faqRepeatedAnswer],
    ]),
  ])
}
