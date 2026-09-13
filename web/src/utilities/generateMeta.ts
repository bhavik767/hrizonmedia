import type { Metadata } from 'next'

import type { Media, Page, Post, Config } from '../payload-types'

import { mergeOpenGraph } from './mergeOpenGraph'
import { getServerSideURL } from './getURL'

const getImageURL = (image?: Media | Config['db']['defaultIDType'] | null) => {
  const serverUrl = getServerSideURL()

  let url = serverUrl + '/website-template-OG.webp'

  if (image && typeof image === 'object' && 'url' in image) {
    const ogUrl = image.sizes?.og?.url

    url = ogUrl ? serverUrl + ogUrl : serverUrl + image.url
  }

  return url
}

// Path prefixes matching the live route for each collection (see generatePreviewPath.ts).
const collectionPathPrefix: Record<'pages' | 'posts', string> = {
  pages: '',
  posts: '/posts',
}

const getCanonicalURL = ({
  collection,
  doc,
}: {
  collection: 'pages' | 'posts'
  doc: Partial<Page> | Partial<Post> | null
}) => {
  // A manually-entered canonical always wins over the derived default.
  if (doc?.meta?.canonical) {
    return doc.meta.canonical
  }

  const slug = Array.isArray(doc?.slug) ? doc?.slug.join('/') : doc?.slug

  if (!slug) {
    return getServerSideURL()
  }

  return `${getServerSideURL()}${collectionPathPrefix[collection]}/${slug}`
}

export const generateMeta = async (args: {
  collection?: 'pages' | 'posts'
  doc: Partial<Page> | Partial<Post> | null
}): Promise<Metadata> => {
  const { collection = 'pages', doc } = args

  const ogImage = getImageURL(doc?.meta?.image)

  const title = doc?.meta?.title
    ? doc?.meta?.title + ' | Payload Website Template'
    : 'Payload Website Template'

  return {
    alternates: {
      canonical: getCanonicalURL({ collection, doc }),
    },
    description: doc?.meta?.description,
    openGraph: mergeOpenGraph({
      description: doc?.meta?.description || '',
      images: ogImage
        ? [
            {
              url: ogImage,
            },
          ]
        : undefined,
      title,
      url: Array.isArray(doc?.slug) ? doc?.slug.join('/') : '/',
    }),
    title,
  }
}
