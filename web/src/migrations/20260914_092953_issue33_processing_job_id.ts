import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "processing_jobs" ADD COLUMN "processing_job_id" varchar NOT NULL;
  CREATE UNIQUE INDEX "processing_jobs_processing_job_id_idx" ON "processing_jobs" USING btree ("processing_job_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "processing_jobs_processing_job_id_idx";
  ALTER TABLE "processing_jobs" DROP COLUMN "processing_job_id";`)
}
