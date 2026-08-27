import { defaultAuthor } from '@/endpoints/seed/author'
import { getCachedGlobal } from '@/utilities/getGlobals'

export type SiteAuthor = {
  biography: string
  name: string
}

/**
 * The site's byline and biography, falling back to what the site ships with
 * where the Author has not set a value. The fallback is not defensive padding:
 * it is what makes the global safe to edit one field at a time.
 */
export async function getSiteAuthor(): Promise<SiteAuthor> {
  const author = await getCachedGlobal('author', 0)()

  return {
    biography: author?.biography || defaultAuthor.biography,
    name: author?.name || defaultAuthor.name,
  }
}
