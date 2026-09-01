/*
 * Puts the test database back to a known-good empty state.
 *
 * This used to be `rm -f encryptstream.db*`, which was correct but expensive:
 * deleting the file means the next boot rebuilds the entire schema from
 * nothing, and both halves of the feedback loop pay for it — vitest's first
 * `getPayload()`, and again when Playwright boots `npm run dev`. That is the
 * reason `vitest.config.mts` needs a 120s hook timeout and `playwright.config.ts`
 * a 180s server timeout.
 *
 * So the schema is built once into `tests/.template.db` and restored by file
 * copy after that. A restored template already matches the code, so Drizzle's
 * dev push finds no diff — which is also what keeps the run from hanging.
 * `pushDevSchema` asks "Accept warnings and push schema to database?" through
 * the `prompts` package whenever the diff is destructive, and there is no env
 * var to auto-answer it (`PAYLOAD_FORCE_DRIZZLE_PUSH` only forces the diff to
 * be recomputed; it does not accept warnings). Nothing is attached to answer in
 * an unattended run, so the only reliable fix is to never produce warnings.
 *
 * The template rebuilds itself when the schema-defining sources change — see
 * `isSchemaSource` — so nobody has to remember to do it.
 *
 * Usage:
 *   node scripts/reset-db.mjs             restore, rebuilding only if stale
 *   node scripts/reset-db.mjs --rebuild   force a rebuild of the template
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DB = path.join(webDir, 'encryptstream.db')
const SUFFIXES = ['', '-journal', '-wal', '-shm']
const TEMPLATE = path.join(webDir, 'tests', '.template.db')
const TEMPLATE_HASH = path.join(webDir, 'tests', '.template.db.hash')
const PORT = 3000

const log = (msg) => console.log(`[reset-db] ${msg}`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/*
 * The files that decide what the schema looks like. Deliberately narrower than
 * "everything under src/": a template that rebuilt whenever a component changed
 * would give back all the time this script saves. Block configs are included
 * because a block's fields are columns; its React component is not.
 */
const isSchemaSource = (rel) => {
  const p = rel.replace(/\\/g, '/')
  if (p === 'src/payload.config.ts' || p === 'src/payload-types.ts') return true
  if (/^src\/(collections|fields|forms|plugins)\//.test(p)) return true
  if (/^src\/(Header|Footer|Author)\/config\.ts$/.test(p)) return true
  if (/^src\/blocks\/.+\/config\.ts$/.test(p)) return true
  return false
}

const walk = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

const schemaHash = () => {
  const hash = createHash('sha256')
  const files = walk(path.join(webDir, 'src'))
    .map((file) => path.relative(webDir, file))
    .filter(isSchemaSource)
    .sort()

  for (const rel of files) {
    hash.update(rel.replace(/\\/g, '/'))
    hash.update(fs.readFileSync(path.join(webDir, rel)))
  }
  return hash.digest('hex')
}

/*
 * Anything still holding the database keeps the delete from working. On Windows
 * that surfaces as EBUSY/EPERM and a reset that silently did nothing, which puts
 * the run straight back into the schema-push hang described above. A dev server
 * left over from an earlier run is the usual culprit, so take the port back
 * rather than leaving it for a human.
 */
const pidsOnPort = () => {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
      const listening = out
        .split(/\r?\n/)
        .filter((line) => /LISTENING/i.test(line) && new RegExp(`:${PORT}\\s`).test(line))
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => pid && pid !== '0')
      return [...new Set(listening)]
    }
    const out = execFileSync('lsof', ['-ti', `tcp:${PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
    return [...new Set(out.split(/\r?\n/).filter(Boolean))]
  } catch {
    // No listener, or the tool is unavailable. Either way there is nothing to stop.
    return []
  }
}

const portIsFree = () =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: PORT })
    const done = (free) => {
      socket.destroy()
      resolve(free)
    }
    socket.once('connect', () => done(false))
    socket.once('error', () => done(true))
    setTimeout(() => done(false), 1000)
  })

const freePort = async () => {
  const pids = pidsOnPort()
  if (!pids.length) return

  log(`port ${PORT} is held by pid ${pids.join(', ')} — stopping it`)
  for (const pid of pids) {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/F', '/T', '/PID', pid])
      else process.kill(Number(pid), 'SIGKILL')
    } catch (err) {
      log(`could not stop pid ${pid}: ${err.message}`)
    }
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    if (await portIsFree()) return
    await sleep(250)
  }
  log(`warning: port ${PORT} is still held after 5s`)
}

/* Windows releases file handles lazily after a kill, so retry rather than fail. */
const removeDatabase = async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    let stuck = null
    for (const suffix of SUFFIXES) {
      try {
        fs.rmSync(`${DB}${suffix}`, { force: true })
      } catch (err) {
        stuck = err
      }
    }
    if (!stuck) return
    if (attempt === 19) throw new Error(`could not delete the database: ${stuck.message}`)
    await sleep(250)
  }
}

const buildTemplate = async () => {
  log('building the template database (one cold schema push)')
  await removeDatabase()

  const started = Date.now()
  /*
   * node with tsx's loader rather than `npx tsx`: from Node 20 onwards
   * spawnSync refuses to run a .cmd shim without `shell: true`, and going
   * through a shell would mean quoting a path that contains a space on this
   * machine. This is also a process less to start.
   */
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx/esm', path.join('scripts', 'build-template-db.ts')],
    {
      cwd: webDir,
      env: { ...process.env, NODE_OPTIONS: '--no-deprecation' },
      stdio: 'inherit',
    },
  )
  if (result.status !== 0) {
    throw new Error('build-template-db.ts failed; the template was not written')
  }
  if (!fs.existsSync(DB)) {
    throw new Error('build-template-db.ts finished but produced no database')
  }

  fs.mkdirSync(path.dirname(TEMPLATE), { recursive: true })
  for (const suffix of SUFFIXES) {
    fs.rmSync(`${TEMPLATE}${suffix}`, { force: true })
  }
  /*
   * Carry the WAL across when one survived the close. The pair is consistent
   * because the connection is shut down before we get here, and a template
   * without its WAL would be missing whatever the close had not checkpointed.
   * `-shm` is rebuilt on open, so it is not worth copying.
   */
  fs.copyFileSync(DB, TEMPLATE)
  if (fs.existsSync(`${DB}-wal`) && fs.statSync(`${DB}-wal`).size > 0) {
    fs.copyFileSync(`${DB}-wal`, `${TEMPLATE}-wal`)
  }
  fs.writeFileSync(TEMPLATE_HASH, schemaHash())
  log(`template built in ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

const restoreTemplate = () => {
  fs.copyFileSync(TEMPLATE, DB)
  if (fs.existsSync(`${TEMPLATE}-wal`)) fs.copyFileSync(`${TEMPLATE}-wal`, `${DB}-wal`)
}

const run = async () => {
  const expected = schemaHash()
  const current = fs.existsSync(TEMPLATE_HASH) ? fs.readFileSync(TEMPLATE_HASH, 'utf8').trim() : null

  let reason = null
  if (process.argv.includes('--rebuild')) reason = '--rebuild was passed'
  else if (!fs.existsSync(TEMPLATE)) reason = 'there is no template yet'
  else if (current !== expected) reason = 'the schema sources changed'

  await freePort()

  if (reason) {
    log(reason)
    await buildTemplate()
  }

  await removeDatabase()
  restoreTemplate()
  log('database reset from template')
}

await run()
