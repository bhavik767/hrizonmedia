import { getServerSideURL } from '../getURL'

import type { ExtractedBody, ExtractedHeading, ExtractedImage, ExtractedLink } from './types'

// Generic walker over Payload's Lexical JSON (richText field values) *and* plain Payload block
// arrays (Pages' `layout`) at the same time, since both shapes nest plain objects/arrays the
// same way — see collectBlocks.ts (src/utilities/schema/collectBlocks.ts) for the same idea
// applied to schema.org generation. We don't need to know which block types exist ahead of
// time: any object we don't specifically recognize is walked field-by-field, so a `richText`
// field buried inside a block's `fields` (e.g. the Content block's `columns[].richText`, or the
// CallToAction block's `richText`) is still found and its text/headings/links/images counted.

type Visitor = {
  onHeading: (heading: ExtractedHeading) => void
  onImage: (image: ExtractedImage) => void
  onLink: (link: ExtractedLink) => void
  onText: (text: string) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const siteHostnames = (): string[] => {
  const hosts: string[] = []

  try {
    hosts.push(new URL(getServerSideURL()).hostname)
  } catch {
    // getServerSideURL() falls back to a bare string in some envs — ignore if unparseable.
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    hosts.push(window.location.hostname)
  }

  return hosts
}

const isInternalURL = (url: string): boolean => {
  if (!url || url.startsWith('/') || url.startsWith('#')) return true

  if (!/^([a-z][a-z0-9+.-]*:)?\/\//i.test(url)) {
    // Not an absolute URL (protocol-relative or scheme://) — treat as a relative/internal path.
    return true
  }

  try {
    const parsed = new URL(url)
    return siteHostnames().includes(parsed.hostname)
  } catch {
    return true
  }
}

// Collects the plain text under any subtree (used for heading text and link text) without
// triggering the visitor's onHeading/onLink/onImage callbacks for nested nodes — we only want
// the leaf text here.
const collectPlainText = (node: unknown): string => {
  let text = ''

  const walkText = (n: unknown) => {
    if (Array.isArray(n)) {
      n.forEach(walkText)
      return
    }
    if (!isRecord(n)) return

    if (n.type === 'text' && typeof n.text === 'string') {
      text += n.text
      return
    }

    if (Array.isArray(n.children)) walkText(n.children)
  }

  walkText(node)
  return text
}

const resolveImageAlt = (uploadNode: Record<string, unknown>): string => {
  // Inline `UploadFeature` nodes shape their data as `{ fields: { value, relationTo } }` (or, in
  // older Lexical states, `{ value, relationTo }` directly). `value` is only an alt-bearing
  // object when Payload populated the relationship (depth > 0); otherwise it's a bare ID and we
  // have nothing to check.
  const fields = isRecord(uploadNode.fields) ? uploadNode.fields : uploadNode
  const value = fields.value

  if (isRecord(value) && typeof value.alt === 'string') {
    return value.alt
  }

  return ''
}

function walk(node: unknown, visitor: Visitor): void {
  if (node === null || node === undefined) return

  if (Array.isArray(node)) {
    node.forEach((item) => walk(item, visitor))
    return
  }

  if (!isRecord(node)) return

  switch (node.type) {
    case 'heading': {
      const tag = typeof node.tag === 'string' ? node.tag : 'h2'
      const text = collectPlainText(node)
      if (text.trim()) visitor.onHeading({ tag, text })
      visitor.onText(text)
      return
    }
    case 'link': {
      const fields = isRecord(node.fields) ? node.fields : {}
      const text = collectPlainText(node)
      const isInternal =
        fields.linkType === 'internal' ||
        (typeof fields.url === 'string' ? isInternalURL(fields.url) : true)
      visitor.onLink({ internal: isInternal, text })
      // Still walk children so the link's own text counts toward body word count / density too.
      walk(node.children, visitor)
      return
    }
    case 'upload': {
      visitor.onImage({ alt: resolveImageAlt(node) })
      return
    }
    case 'text': {
      if (typeof node.text === 'string') visitor.onText(node.text)
      return
    }
    default:
      break
  }

  // Fallback: recurse into every own property. This is what lets us reach into block `fields`
  // (Pages' `layout` blocks, or blocks embedded in a Post's `content` via BlocksFeature) without
  // hand-writing a case for every block type — see the file header comment.
  for (const key of Object.keys(node)) {
    if (key === 'id' || key === 'blockName' || key === 'blockType') continue
    walk(node[key], visitor)
  }
}

const countWords = (text: string): number => {
  const matches = text.trim().match(/\S+/g)
  return matches ? matches.length : 0
}

/**
 * Extracts everything the SEO analysis needs (plain text, headings, links, images) from one or
 * more content sources belonging to a single document — e.g. a Post's `content` richText field,
 * or a Page's `hero.richText` plus its `layout` blocks array. Sources are walked in the order
 * given, so `plainText` (and therefore the "introduction" check) reflects the order content
 * actually appears on the page.
 */
export function extractBodyContent(sources: unknown[]): ExtractedBody {
  const headings: ExtractedHeading[] = []
  const links: ExtractedLink[] = []
  const images: ExtractedImage[] = []
  let plainText = ''

  const visitor: Visitor = {
    onHeading: (heading) => headings.push(heading),
    onImage: (image) => images.push(image),
    onLink: (link) => links.push(link),
    onText: (text) => {
      if (text) plainText += (plainText ? ' ' : '') + text
    },
  }

  for (const source of sources) {
    walk(source, visitor)
  }

  return {
    headings,
    images,
    links,
    plainText,
    wordCount: countWords(plainText),
  }
}
