import { postgresAdapter } from '@payloadcms/db-postgres'
import { s3Storage } from '@payloadcms/storage-s3'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { Authors } from './collections/Authors'
import { AuditEvents } from './collections/AuditEvents'
import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { MediaAccess } from './collections/MediaAccess'
import { MediaAssets } from './collections/MediaAssets'
import { MediaFolders } from './collections/MediaFolders'
import { MediaOperations } from './collections/MediaOperations'
import { OrganisationMemberships } from './collections/OrganisationMemberships'
import { OrganisationInvitations } from './collections/OrganisationInvitations'
import { OrganisationSettings } from './collections/OrganisationSettings'
import { Organisations } from './collections/Organisations'
import { Pages } from './collections/Pages'
import { Members } from './collections/Members'
import { PlaybackGrants } from './collections/PlaybackGrants'
import { PlatformAdministrators } from './collections/PlatformAdministrators'
import { Posts } from './collections/Posts'
import { ProcessingJobs } from './collections/ProcessingJobs'
import { ReusableBlocks } from './collections/ReusableBlocks'
import { UploadSessions } from './collections/UploadSessions'
import { Users } from './collections/Users'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { Integrations } from './Integrations/config'
import { migrations } from './migrations'
import { Organization } from './Organization/config'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

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
      // Adds icons in front of every sidebar link, bumps up the group-heading font size (see
      // custom.scss), and defaults every group to collapsed. See src/components/AdminNav.
      Nav: '@/components/AdminNav',
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
  db: postgresAdapter({
    prodMigrations: migrations,
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  collections: [
    Pages,
    Posts,
    Media,
    Categories,
    Authors,
    Users,
    Members,
    Organisations,
    OrganisationMemberships,
    OrganisationInvitations,
    OrganisationSettings,
    PlatformAdministrators,
    MediaAssets,
    MediaFolders,
    MediaAccess,
    MediaOperations,
    UploadSessions,
    ProcessingJobs,
    PlaybackGrants,
    AuditEvents,
    ReusableBlocks,
  ],
  cors: [getServerSideURL()].filter(Boolean),
  csrf: [getServerSideURL()].filter(Boolean),
  // Media is the only collection with folder organization enabled; hide the cross-collection
  // "Browse by Folder" entry point at the top of the admin nav sidebar while keeping folders
  // usable from within the Media list itself.
  folders: {
    browseByFolder: false,
  },
  globals: [Header, Footer, Organization, Integrations],
  plugins: [...plugins, railwayStorage],
  secret: process.env.PAYLOAD_SECRET || '',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    // Remote fixtures share PostgreSQL, but must never claim jobs with runner-local fakes.
    autoRun:
      process.env.HRIZONMEDIA_STAGING_TESTS === 'true'
        ? []
        : [{ cron: '*/10 * * * * *', limit: 1, queue: 'media-processing' }],
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
    deleteJobOnComplete: true,
    tasks: [
      {
        handler: async ({ req }) => {
          const { cleanupAbandonedUploads } = await import('./media/library')
          const { runMediaLifecycle } = await import('./media/lifecycle')
          const { runProcessingCycle } = await import('./media/processing')
          const { logMediaDiagnostic } = await import('./media/diagnostics')
          try {
            await cleanupAbandonedUploads(req.payload)
            await runProcessingCycle(req.payload)
            await runMediaLifecycle(req.payload)
            logMediaDiagnostic('info', 'media_cycle_completed')
          } catch {
            logMediaDiagnostic('error', 'media_cycle_failed')
            // A fixed error also keeps Payload's job failure logs credential-safe.
            throw new Error('Media maintenance failed; inspect structured diagnostics.')
          }
          return { output: {} }
        },
        inputSchema: [],
        outputSchema: [],
        schedule: [{ cron: '*/10 * * * * *', queue: 'media-processing' }],
        slug: 'process-media-jobs',
      },
    ],
  },
})
