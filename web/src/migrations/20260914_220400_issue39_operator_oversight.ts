import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'invitation_created' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'invitation_accepted' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'member_disabled' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'upload_started' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'upload_completed' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'upload_aborted' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'upload_expired' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'processing_queued' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'processing_dispatched' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'processing_ready' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'processing_failed' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'processing_retried' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'playback_granted' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'playback_licence_acquired' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'processing_callback_received' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'processing_callback_rejected' BEFORE 'asset_deleted';
  ALTER TYPE "public"."enum_audit_events_action" ADD VALUE 'operations_controls_updated';
  CREATE TABLE "media_operations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"provider_concurrency" numeric NOT NULL,
  	"kill_switch_enabled" boolean DEFAULT false NOT NULL,
  	"updated_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "audit_events" ALTER COLUMN "asset_id" DROP NOT NULL;
  ALTER TABLE "audit_events" ADD COLUMN "member_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_operations_id" integer;
  ALTER TABLE "media_operations" ADD CONSTRAINT "media_operations_updated_by_id_pilot_members_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."pilot_members"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "media_operations_key_idx" ON "media_operations" USING btree ("key");
  CREATE INDEX "media_operations_updated_by_idx" ON "media_operations" USING btree ("updated_by_id");
  CREATE INDEX "media_operations_updated_at_idx" ON "media_operations" USING btree ("updated_at");
  CREATE INDEX "media_operations_created_at_idx" ON "media_operations" USING btree ("created_at");
  ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_member_id_pilot_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."pilot_members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_operations_fk" FOREIGN KEY ("media_operations_id") REFERENCES "public"."media_operations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "audit_events_member_idx" ON "audit_events" USING btree ("member_id");
  CREATE INDEX "payload_locked_documents_rels_media_operations_id_idx" ON "payload_locked_documents_rels" USING btree ("media_operations_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media_operations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "media_operations" CASCADE;
  ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_member_id_pilot_members_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_operations_fk";
  
  DELETE FROM "audit_events"
  WHERE "action" NOT IN ('asset_deleted', 'asset_expired', 'access_revoked', 'source_deleted', 'outputs_deleted');
  ALTER TABLE "audit_events" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_audit_events_action";
  CREATE TYPE "public"."enum_audit_events_action" AS ENUM('asset_deleted', 'asset_expired', 'access_revoked', 'source_deleted', 'outputs_deleted');
  ALTER TABLE "audit_events" ALTER COLUMN "action" SET DATA TYPE "public"."enum_audit_events_action" USING "action"::"public"."enum_audit_events_action";
  DROP INDEX "audit_events_member_idx";
  DROP INDEX "payload_locked_documents_rels_media_operations_id_idx";
  ALTER TABLE "audit_events" ALTER COLUMN "asset_id" SET NOT NULL;
  ALTER TABLE "audit_events" DROP COLUMN "member_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_operations_id";`)
}
