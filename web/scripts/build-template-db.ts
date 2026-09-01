/*
 * Creates the schema in `encryptstream.db` and shuts the connection down again.
 *
 * This is the one cold schema push the feedback loop still pays for. Everything
 * after it is a file copy — `scripts/reset-db.mjs` runs this when the template
 * is missing or stale, then copies the result to `tests/.template.db`. Run it
 * yourself with `npm run test:db:template`.
 *
 * `getPayload()` is all it takes: connecting pushes the schema through Drizzle,
 * and the `onInit` hook in `src/payload.config.ts` ensures the early-access form
 * exists, so the template carries the same starting state a real boot would.
 *
 * dotenv has to load before the config is evaluated — the config reads
 * `DATABASE_URI` and `PAYLOAD_SECRET` at module scope, and unlike the test
 * suites this script has no framework loading `.env` for it.
 */
import 'dotenv/config'

import { getPayload } from 'payload'
import config from '@payload-config'

const run = async () => {
  const started = Date.now()
  const payload = await getPayload({ config })

  /*
   * Close before the caller copies the file. An open connection leaves the WAL
   * holding writes that the copy would miss, and on Windows it also keeps a
   * handle that stops the database being deleted.
   *
   * `destroy` is optional on the adapter interface — the SQLite adapter does
   * implement it, but the call is guarded so a future adapter without one
   * degrades to `process.exit` closing the handle rather than failing here.
   */
  await payload.db.destroy?.()

  payload.logger.info(`schema ready in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  process.exit(0)
}

await run()
