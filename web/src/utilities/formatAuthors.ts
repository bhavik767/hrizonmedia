import type { Post } from '@/payload-types'

/**
 * Formats the `authors` relationship from a Post into a prettified string.
 * @param authors - The `authors` array from a Post (each entry a populated Author doc, or an ID if not populated).
 * @returns A prettified string of author names.
 * @example
 *
 * [Author1, Author2] becomes 'Author1 and Author2'
 * [Author1, Author2, Author3] becomes 'Author1, Author2, and Author3'
 *
 */
export const formatAuthors = (authors: NonNullable<Post['authors']>) => {
  // Only use populated author docs that have a name
  const authorNames = authors
    .map((author) => (typeof author === 'object' && author !== null ? author.name : undefined))
    .filter((name): name is string => Boolean(name))

  if (authorNames.length === 0) return ''
  if (authorNames.length === 1) return authorNames[0]
  if (authorNames.length === 2) return `${authorNames[0]} and ${authorNames[1]}`

  return `${authorNames.slice(0, -1).join(', ')} and ${authorNames[authorNames.length - 1]}`
}
