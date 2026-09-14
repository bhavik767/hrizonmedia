import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_media_assets_status" AS ENUM('uploading', 'queued', 'processing', 'ready', 'failed', 'expired', 'deleted');
  CREATE TYPE "public"."enum_upload_sessions_status" AS ENUM('pending', 'completed');
  CREATE TYPE "public"."enum_processing_jobs_status" AS ENUM('queued', 'processing', 'ready', 'failed');
  CREATE TABLE "media_assets" (
    "id" serial PRIMARY KEY NOT NULL,
    "media_asset_id" varchar NOT NULL,
    "owner_id" integer NOT NULL,
    "file_name" varchar NOT NULL,
    "mime_type" varchar NOT NULL,
    "size" numeric NOT NULL,
    "status" "enum_media_assets_status" NOT NULL,
    "status_changed_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "upload_sessions" (
    "id" serial PRIMARY KEY NOT NULL,
    "upload_session_id" varchar NOT NULL,
    "asset_id" integer NOT NULL,
    "owner_id" integer NOT NULL,
    "file_name" varchar NOT NULL,
    "mime_type" varchar NOT NULL,
    "size" numeric NOT NULL,
    "object_key" varchar,
    "status" "enum_upload_sessions_status" NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "processing_jobs" (
    "id" serial PRIMARY KEY NOT NULL,
    "provider_job_id" varchar NOT NULL,
    "asset_id" integer NOT NULL,
    "owner_id" integer NOT NULL,
    "status" "enum_processing_jobs_status" NOT NULL,
    "queued_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_assets_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "upload_sessions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "processing_jobs_id" integer;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_pilot_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."pilot_members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_owner_id_pilot_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."pilot_members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_owner_id_pilot_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."pilot_members"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "media_assets_media_asset_id_idx" ON "media_assets" USING btree ("media_asset_id");
  CREATE INDEX "media_assets_owner_idx" ON "media_assets" USING btree ("owner_id");
  CREATE INDEX "media_assets_updated_at_idx" ON "media_assets" USING btree ("updated_at");
  CREATE INDEX "media_assets_created_at_idx" ON "media_assets" USING btree ("created_at");
  CREATE UNIQUE INDEX "upload_sessions_upload_session_id_idx" ON "upload_sessions" USING btree ("upload_session_id");
  CREATE UNIQUE INDEX "upload_sessions_asset_idx" ON "upload_sessions" USING btree ("asset_id");
  CREATE INDEX "upload_sessions_owner_idx" ON "upload_sessions" USING btree ("owner_id");
  CREATE INDEX "upload_sessions_updated_at_idx" ON "upload_sessions" USING btree ("updated_at");
  CREATE INDEX "upload_sessions_created_at_idx" ON "upload_sessions" USING btree ("created_at");
  CREATE UNIQUE INDEX "processing_jobs_provider_job_id_idx" ON "processing_jobs" USING btree ("provider_job_id");
  CREATE UNIQUE INDEX "processing_jobs_asset_idx" ON "processing_jobs" USING btree ("asset_id");
  CREATE INDEX "processing_jobs_owner_idx" ON "processing_jobs" USING btree ("owner_id");
  CREATE INDEX "processing_jobs_updated_at_idx" ON "processing_jobs" USING btree ("updated_at");
  CREATE INDEX "processing_jobs_created_at_idx" ON "processing_jobs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_assets_fk" FOREIGN KEY ("media_assets_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_upload_sessions_fk" FOREIGN KEY ("upload_sessions_id") REFERENCES "public"."upload_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_processing_jobs_fk" FOREIGN KEY ("processing_jobs_id") REFERENCES "public"."processing_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_media_assets_id_idx" ON "payload_locked_documents_rels" USING btree ("media_assets_id");
  CREATE INDEX "payload_locked_documents_rels_upload_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("upload_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_processing_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("processing_jobs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_assets_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_upload_sessions_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_processing_jobs_fk";
  DROP INDEX "payload_locked_documents_rels_media_assets_id_idx";
  DROP INDEX "payload_locked_documents_rels_upload_sessions_id_idx";
  DROP INDEX "payload_locked_documents_rels_processing_jobs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_assets_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "upload_sessions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "processing_jobs_id";
  ALTER TABLE "media_assets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "upload_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "processing_jobs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "media_assets" CASCADE;
  DROP TABLE "upload_sessions" CASCADE;
  DROP TABLE "processing_jobs" CASCADE;
  DROP TYPE "public"."enum_media_assets_status";
  DROP TYPE "public"."enum_upload_sessions_status";
  DROP TYPE "public"."enum_processing_jobs_status";`)
}
