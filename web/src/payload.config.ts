import { postgresAdapter } from '@payloadcms/db-postgres'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { s3Storage } from '@payloadcms/storage-s3'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { Author } from './Author/config'
import { ensureEarlyAccessForm } from './forms/earlyAccess'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { migrations } from './migrations'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const databaseURL = process.env.DATABASE_URL
const usesPostgres =
  databaseURL?.startsWith('postgres://') || databaseURL?.startsWith('postgresql://')

const db = usesPostgres
  ? postgresAdapter({
      prodMigrations: migrations,
      pool: {
        connectionString: databaseURL,
      },
    })
  : sqliteAdapter({
      busyTimeout: 10_000,
      client: {
        url: process.env.DATABASE_URI || 'file:./encryptstream.db',
      },
      wal: true,
    })

const bucketConfigured = Boolean(
  process.env.BUCKET &&
  process.env.ACCESS_KEY_ID &&
  process.env.SECRET_ACCESS_KEY &&
  process.env.ENDPOINT,
)

const railwayStorage = s3Storage({
  alwaysInsertFields: true,
  bucket: process.env.BUCKET || 'local-storage-disabled',
  collections: {
    media: {
      signedDownloads: {
        expiresIn: 24 * 60 * 60,
      },
    },
  },
  config: {
    credentials: {
      accessKeyId: process.env.ACCESS_KEY_ID || '',
      secretAccessKey: process.env.SECRET_ACCESS_KEY || '',
    },
    endpoint: process.env.ENDPOINT,
    forcePathStyle:
      process.env.S3_FORCE_PATH_STYLE === 'true' || process.env.AWS_S3_URL_STYLE === 'path',
    region: process.env.REGION || 'auto',
  },
  enabled: bucketConfigured,
})

export default buildConfig({
  admin: {
    components: {
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeLogin: ['@/components/BeforeLogin'],
      // The `BeforeDashboard` component renders the 'welcome' block that you see after logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeDashboard: ['@/components/BeforeDashboard'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  /*
   * SQLite's default rollback journal takes an exclusive lock for the whole of
   * a write, and with a busy timeout of zero any reader that arrives during one
   * fails outright with "database is locked" rather than waiting. Several
   * processes touch this file at once — the request handler, the worker Next
   * runs `generateStaticParams` in, and the test process seeding fixtures — so
   * that default turns ordinary contention into a 500 on whichever page lost
   * the race.
   *
   * WAL lets readers carry on while a write is in flight, and the busy timeout
   * covers the writer-against-writer case that is left. Neither hides a real
   * error: a query that is still blocked after ten seconds still fails.
   */
  db,
  collections: [Pages, Posts, Media, Categories, Users],
  cors: [getServerSideURL()].filter(Boolean),
  globals: [Header, Footer, Author],
  /*
   * The site's single ask needs a form to submit against, and it appears on
   * every Article and in the footer. Ensuring it on boot rather than leaving it
   * to a seed means a freshly reset database still collects addresses — the
   * capture is the only conversion surface here, so an empty corner where it
   * should be is a lost reader, not a cosmetic defect.
   */
  onInit: async (payload) => {
    await ensureEarlyAccessForm(payload)
  },
  plugins: [...plugins, railwayStorage],
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        // Allow logged in users to execute this endpoint (default)
        if (req.user) return true

        const secret = process.env.CRON_SECRET
        if (!secret) return false

        // If there is no logged in user, then check
        // for the Vercel Cron secret to be present as an
        // Authorization header:
        const authHeader = req.headers.get('authorization')
        return authHeader === `Bearer ${secret}`
      },
    },
    tasks: [],
  },
})
