import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_processing_jobs_status" ADD VALUE 'dispatching' BEFORE 'processing';
  ALTER TABLE "processing_jobs" ALTER COLUMN "provider_job_id" DROP NOT NULL;
  ALTER TABLE "processing_jobs" ADD COLUMN "dispatch_by" timestamp(3) with time zone;
  ALTER TABLE "processing_jobs" ADD COLUMN "next_attempt_at" timestamp(3) with time zone;
  ALTER TABLE "processing_jobs" ADD COLUMN "attempts" numeric DEFAULT 0 NOT NULL;
  ALTER TABLE "processing_jobs" ADD COLUMN "lease_token" varchar;
  ALTER TABLE "processing_jobs" ADD COLUMN "leased_until" timestamp(3) with time zone;
  ALTER TABLE "processing_jobs" ADD COLUMN "dispatched_at" timestamp(3) with time zone;
  ALTER TABLE "processing_jobs" ADD COLUMN "started_at" timestamp(3) with time zone;
  ALTER TABLE "processing_jobs" ADD COLUMN "processing_deadline_at" timestamp(3) with time zone;
  ALTER TABLE "processing_jobs" ADD COLUMN "ready_at" timestamp(3) with time zone;
  ALTER TABLE "processing_jobs" ADD COLUMN "failed_at" timestamp(3) with time zone;
  ALTER TABLE "processing_jobs" ADD COLUMN "failure_code" varchar;
  ALTER TABLE "processing_jobs" ADD COLUMN "failure_message" varchar;
  ALTER TABLE "processing_jobs" ADD COLUMN "object_key" varchar;
  ALTER TABLE "processing_jobs" ADD COLUMN "source_width" numeric;
  ALTER TABLE "processing_jobs" ADD COLUMN "source_height" numeric;
  ALTER TABLE "processing_jobs" ADD COLUMN "source_duration_seconds" numeric;
  ALTER TABLE "processing_jobs" ADD COLUMN "renditions" jsonb;
  UPDATE "processing_jobs" AS job
  SET "dispatch_by" = job."queued_at" + interval '30 seconds',
      "next_attempt_at" = job."queued_at",
      "attempts" = CASE WHEN job."provider_job_id" IS NULL THEN 0 ELSE 1 END,
      "object_key" = COALESCE(session."object_key", 'legacy-unavailable/' || job."processing_job_id"),
      "source_width" = 1920,
      "source_height" = 1080,
      "source_duration_seconds" = 2,
      "renditions" = '[{"audioCodec":"aac","height":360,"videoCodec":"h264","width":640},{"audioCodec":"aac","height":480,"videoCodec":"h264","width":854},{"audioCodec":"aac","height":720,"videoCodec":"h264","width":1280},{"audioCodec":"aac","height":1080,"videoCodec":"h264","width":1920}]'::jsonb
  FROM "upload_sessions" AS session
  WHERE session."asset_id" = job."asset_id";
  UPDATE "processing_jobs"
  SET "dispatch_by" = "queued_at" + interval '30 seconds',
      "next_attempt_at" = "queued_at",
      "object_key" = COALESCE("object_key", 'legacy-unavailable/' || "processing_job_id"),
      "source_width" = COALESCE("source_width", 1920),
      "source_height" = COALESCE("source_height", 1080),
      "source_duration_seconds" = COALESCE("source_duration_seconds", 2),
      "renditions" = COALESCE("renditions", '[]'::jsonb);
  ALTER TABLE "processing_jobs" ALTER COLUMN "dispatch_by" SET NOT NULL;
  ALTER TABLE "processing_jobs" ALTER COLUMN "next_attempt_at" SET NOT NULL;
  ALTER TABLE "processing_jobs" ALTER COLUMN "object_key" SET NOT NULL;
  ALTER TABLE "processing_jobs" ALTER COLUMN "source_width" SET NOT NULL;
  ALTER TABLE "processing_jobs" ALTER COLUMN "source_height" SET NOT NULL;
  ALTER TABLE "processing_jobs" ALTER COLUMN "source_duration_seconds" SET NOT NULL;
  ALTER TABLE "processing_jobs" ALTER COLUMN "renditions" SET NOT NULL;
  CREATE INDEX "processing_jobs_dispatch_by_idx" ON "processing_jobs" USING btree ("dispatch_by");
  CREATE INDEX "processing_jobs_next_attempt_at_idx" ON "processing_jobs" USING btree ("next_attempt_at");
  CREATE INDEX "processing_jobs_lease_token_idx" ON "processing_jobs" USING btree ("lease_token");
  CREATE INDEX "processing_jobs_leased_until_idx" ON "processing_jobs" USING btree ("leased_until");
  CREATE INDEX "processing_jobs_processing_deadline_at_idx" ON "processing_jobs" USING btree ("processing_deadline_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "processing_jobs" SET "status" = 'queued' WHERE "status" = 'dispatching';
  UPDATE "processing_jobs"
  SET "provider_job_id" = 'provider_job_legacy_' || "id"
  WHERE "provider_job_id" IS NULL;
   ALTER TABLE "processing_jobs" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "public"."enum_processing_jobs_status";
  CREATE TYPE "public"."enum_processing_jobs_status" AS ENUM('queued', 'processing', 'ready', 'failed');
  ALTER TABLE "processing_jobs" ALTER COLUMN "status" SET DATA TYPE "public"."enum_processing_jobs_status" USING "status"::"public"."enum_processing_jobs_status";
  DROP INDEX "processing_jobs_dispatch_by_idx";
  DROP INDEX "processing_jobs_next_attempt_at_idx";
  DROP INDEX "processing_jobs_lease_token_idx";
  DROP INDEX "processing_jobs_leased_until_idx";
  DROP INDEX "processing_jobs_processing_deadline_at_idx";
  ALTER TABLE "processing_jobs" ALTER COLUMN "provider_job_id" SET NOT NULL;
  ALTER TABLE "processing_jobs" DROP COLUMN "dispatch_by";
  ALTER TABLE "processing_jobs" DROP COLUMN "next_attempt_at";
  ALTER TABLE "processing_jobs" DROP COLUMN "attempts";
  ALTER TABLE "processing_jobs" DROP COLUMN "lease_token";
  ALTER TABLE "processing_jobs" DROP COLUMN "leased_until";
  ALTER TABLE "processing_jobs" DROP COLUMN "dispatched_at";
  ALTER TABLE "processing_jobs" DROP COLUMN "started_at";
  ALTER TABLE "processing_jobs" DROP COLUMN "processing_deadline_at";
  ALTER TABLE "processing_jobs" DROP COLUMN "ready_at";
  ALTER TABLE "processing_jobs" DROP COLUMN "failed_at";
  ALTER TABLE "processing_jobs" DROP COLUMN "failure_code";
  ALTER TABLE "processing_jobs" DROP COLUMN "failure_message";
  ALTER TABLE "processing_jobs" DROP COLUMN "object_key";
  ALTER TABLE "processing_jobs" DROP COLUMN "source_width";
  ALTER TABLE "processing_jobs" DROP COLUMN "source_height";
  ALTER TABLE "processing_jobs" DROP COLUMN "source_duration_seconds";
  ALTER TABLE "processing_jobs" DROP COLUMN "renditions";`)
}
