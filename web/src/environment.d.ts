declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PAYLOAD_SECRET?: string
      DATABASE_URL?: string
      DEPLOYMENT_ENVIRONMENT?: 'development' | 'staging' | 'production'
      MEDIA_SCHEDULER_EXTERNAL?: 'true' | 'false'
      MEDIA_SCHEDULER_INTERVAL_MS?: string
      MEDIA_SCHEDULER_ORIGIN?: string
      NEXT_PUBLIC_SERVER_URL?: string
      SERVER_URL?: string
      BUCKET?: string
      ACCESS_KEY_ID?: string
      SECRET_ACCESS_KEY?: string
      ENDPOINT?: string
      REGION?: string
      S3_FORCE_PATH_STYLE?: string
      AWS_S3_URL_STYLE?: string
      VIDEO_S3_ACCESS_KEY_ID?: string
      VIDEO_S3_SECRET_ACCESS_KEY?: string
      VIDEO_S3_BUCKET?: string
      VIDEO_S3_REGION?: string
      VIDEO_CLOUDFRONT_DOMAIN?: string
      VIDEO_CLOUDFRONT_KEY_PAIR_ID?: string
      VIDEO_CLOUDFRONT_PRIVATE_KEY?: string
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
