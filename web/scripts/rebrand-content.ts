import { getPayload } from 'payload'
import config from '@payload-config'

const from = 'EncryptStream'
const to = 'hrizonmedia'

function replaceBrand<T>(value: T): T {
  if (typeof value === 'string') return value.replaceAll(from, to) as T

  if (Array.isArray(value)) {
    return value.map((item) => replaceBrand(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceBrand(item)]),
    ) as T
  }

  return value
}

const run = async () => {
  const payload = await getPayload({ config })
  let updated = 0

  for (const collection of ['pages', 'posts'] as const) {
    const { docs } = await payload.find({
      collection,
      depth: 0,
      limit: 100,
      pagination: false,
    })

    for (const doc of docs) {
      const before = JSON.stringify(doc)
      if (!before.includes(from)) continue

      const record = doc as unknown as {
        id: number | string
        slug?: string | null
        hero?: unknown
        layout?: unknown
        meta?: unknown
        content?: unknown
        title?: string
      }
      const data =
        collection === 'pages'
          ? replaceBrand({ hero: record.hero, layout: record.layout, meta: record.meta })
          : replaceBrand({ content: record.content, meta: record.meta, title: record.title })

      await payload.update({
        collection,
        id: record.id,
        data,
        context: { disableRevalidate: true },
      } as never)

      payload.logger.info(`rebranded ${collection}: ${record.slug ?? record.id}`)
      updated++
    }
  }

  const author = await payload.findGlobal({ slug: 'author', depth: 0 })
  const nextAuthor = replaceBrand({
    name: author.name,
    biography: author.biography,
  })

  if (JSON.stringify(author).includes(from)) {
    await payload.updateGlobal({
      slug: 'author',
      data: nextAuthor,
      context: { disableRevalidate: true },
    })
    payload.logger.info('rebranded global: author')
    updated++
  }

  payload.logger.info(`done — ${updated} records updated`)
  process.exit(0)
}

await run()
