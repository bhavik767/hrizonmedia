import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_upload_sessions_status" ADD VALUE 'aborted';
  ALTER TYPE "public"."enum_upload_sessions_status" ADD VALUE 'expired';
  ALTER TABLE "media_assets" ADD COLUMN "duration_seconds" numeric;
  ALTER TABLE "media_assets" ADD COLUMN "verified_at" timestamp(3) with time zone;
  ALTER TABLE "upload_sessions" ADD COLUMN "file_fingerprint" varchar;
  ALTER TABLE "upload_sessions" ADD COLUMN "provider_upload_id" varchar;
  ALTER TABLE "upload_sessions" ADD COLUMN "part_size" numeric;
  UPDATE "upload_sessions" SET
    "file_fingerprint" = 'legacy:' || "upload_session_id",
    "provider_upload_id" = 'legacy:' || "upload_session_id",
    "part_size" = 5242880;
  ALTER TABLE "upload_sessions" ALTER COLUMN "file_fingerprint" SET NOT NULL;
  ALTER TABLE "upload_sessions" ALTER COLUMN "provider_upload_id" SET NOT NULL;
  ALTER TABLE "upload_sessions" ALTER COLUMN "part_size" SET NOT NULL;
  CREATE UNIQUE INDEX "upload_sessions_provider_upload_id_idx" ON "upload_sessions" USING btree ("provider_upload_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "upload_sessions" SET "status" = 'pending' WHERE "status" IN ('aborted', 'expired');
   ALTER TABLE "upload_sessions" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "public"."enum_upload_sessions_status";
  CREATE TYPE "public"."enum_upload_sessions_status" AS ENUM('pending', 'completed');
  ALTER TABLE "upload_sessions" ALTER COLUMN "status" SET DATA TYPE "public"."enum_upload_sessions_status" USING "status"::"public"."enum_upload_sessions_status";
  DROP INDEX "upload_sessions_provider_upload_id_idx";
  ALTER TABLE "media_assets" DROP COLUMN "duration_seconds";
  ALTER TABLE "media_assets" DROP COLUMN "verified_at";
  ALTER TABLE "upload_sessions" DROP COLUMN "file_fingerprint";
  ALTER TABLE "upload_sessions" DROP COLUMN "provider_upload_id";
  ALTER TABLE "upload_sessions" DROP COLUMN "part_size";`)
}
