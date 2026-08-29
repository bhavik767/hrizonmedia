import type { GlobalConfig } from 'payload'

import { defaultAuthor } from '@/endpoints/seed/author'
import { revalidateAuthor } from './hooks/revalidateAuthor'

/**
 * The site's byline and biography. There is one Author, so this is site
 * configuration rather than a per-Article relationship: the Author sets it once
 * instead of repeating themselves on every Article.
 *
 * The template's multi-author machinery stays in the Posts schema and is simply
 * not surfaced.
 */
export const Author: GlobalConfig = {
  slug: 'author',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      admin: {
        description: 'The byline shown on every Article.',
      },
      defaultValue: defaultAuthor.name,
    },
    {
      name: 'biography',
      type: 'textarea',
      admin: {
        description:
          'Who is behind EncryptStream. The same on every Article, so it describes the company rather than a contributor.',
      },
      defaultValue: defaultAuthor.biography,
    },
  ],
  hooks: {
    afterChange: [revalidateAuthor],
  },
  label: 'Author',
}
