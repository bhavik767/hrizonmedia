export type AnyBlockFields = { blockType: string; [key: string]: unknown }

// Posts store blocks inline inside a Lexical `content` field via BlocksFeature
// (`{ root: { children: [...] } }`, block nodes shaped `{ type: 'block', fields: { blockType,
// ... } }`). Pages store blocks as a plain top-level `layout` array (`{ blockType, ... }[]`).
// This walks either shape the same way so the rest of the structured-data code doesn't need to
// know which one it's looking at. Used both by the Structured Data selector's save-time
// validation (src/fields/structuredData.ts) and by the schema generators below.
export function collectBlocks(source: unknown, blockTypes: string[]): AnyBlockFields[] {
  const results: AnyBlockFields[] = []

  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return

    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }

    const n = node as Record<string, unknown>

    // Pages' `layout` array items: `{ blockType, ...fields }` directly.
    if (typeof n.blockType === 'string' && blockTypes.includes(n.blockType) && n.type !== 'block') {
      results.push(n as AnyBlockFields)
    }

    // Posts' lexical block nodes: `{ type: 'block', fields: { blockType, ...fields } }`.
    if (n.type === 'block' && n.fields && typeof n.fields === 'object') {
      const fields = n.fields as AnyBlockFields
      if (typeof fields.blockType === 'string' && blockTypes.includes(fields.blockType)) {
        results.push(fields)
      }
    }

    if (n.root) walk(n.root)
    if (Array.isArray(n.children)) walk(n.children)
  }

  walk(source)
  return results
}
