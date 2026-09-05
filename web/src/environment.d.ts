declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PAYLOAD_SECRET: string
      DATABASE_URL: string
      DATABASE_URI: string
      NEXT_PUBLIC_SERVER_URL: string
      RAILWAY_PUBLIC_DOMAIN: string
      VERCEL_PROJECT_PRODUCTION_URL: string
      BUCKET: string
      ACCESS_KEY_ID: string
      SECRET_ACCESS_KEY: string
      REGION: string
      ENDPOINT: string
      AWS_S3_URL_STYLE: 'path' | 'virtual'
      S3_FORCE_PATH_STYLE: string
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
