import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_processing_jobs_status"
      ADD VALUE IF NOT EXISTS 'cancelling' BEFORE 'ready';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "processing_jobs"
    SET "status" = 'failed',
        "failure_code" = 'processing_timeout',
        "failure_message" = 'Processing could not be completed. You can retry while the source is available.',
        "failed_at" = NOW(),
        "provider_job_id" = NULL,
        "processing_deadline_at" = NULL,
        "lease_token" = NULL,
        "leased_until" = NULL
    WHERE "status" = 'cancelling';

    ALTER TABLE "processing_jobs" ALTER COLUMN "status" SET DATA TYPE text;
    DROP TYPE "public"."enum_processing_jobs_status";
    CREATE TYPE "public"."enum_processing_jobs_status"
      AS ENUM('queued', 'dispatching', 'processing', 'ready', 'failed');
    ALTER TABLE "processing_jobs"
      ALTER COLUMN "status" SET DATA TYPE "public"."enum_processing_jobs_status"
      USING "status"::"public"."enum_processing_jobs_status";
  `)
}
