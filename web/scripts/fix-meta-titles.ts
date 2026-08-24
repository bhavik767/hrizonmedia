import { getPayload } from 'payload'
import config from '@payload-config'

const run = async () => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'posts', limit: 100, depth: 0 })
  let n = 0
  for (const d of docs) {
    const want = d.title
    if (d.meta?.title !== want) {
      await payload.update({
        collection: 'posts',
        id: d.id,
        data: { meta: { ...(d.meta ?? {}), title: want } },
        context: { disableRevalidate: true },
      })
      payload.logger.info(`fixed: ${d.slug}`)
      n++
    }
  }
  payload.logger.info(`done — ${n} updated`)
  process.exit(0)
}

await run()
