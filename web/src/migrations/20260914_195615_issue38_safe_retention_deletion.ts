import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_audit_events_action" AS ENUM('asset_deleted', 'asset_expired', 'access_revoked', 'source_deleted', 'outputs_deleted');
  CREATE TABLE "audit_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_key" varchar NOT NULL,
  	"action" "enum_audit_events_action" NOT NULL,
  	"asset_id" integer NOT NULL,
  	"actor_id" integer,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"details" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "media_assets" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "media_assets" ADD COLUMN "access_revoked_at" timestamp(3) with time zone;
  ALTER TABLE "media_assets" ADD COLUMN "source_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "media_assets" ADD COLUMN "outputs_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audit_events_id" integer;
  ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_pilot_members_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."pilot_members"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "audit_events_event_key_idx" ON "audit_events" USING btree ("event_key");
  CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");
  CREATE INDEX "audit_events_asset_idx" ON "audit_events" USING btree ("asset_id");
  CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");
  CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");
  CREATE INDEX "audit_events_updated_at_idx" ON "audit_events" USING btree ("updated_at");
  CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_events_fk" FOREIGN KEY ("audit_events_id") REFERENCES "public"."audit_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "media_assets_deleted_at_idx" ON "media_assets" USING btree ("deleted_at");
  CREATE INDEX "media_assets_access_revoked_at_idx" ON "media_assets" USING btree ("access_revoked_at");
  CREATE INDEX "media_assets_source_deleted_at_idx" ON "media_assets" USING btree ("source_deleted_at");
  CREATE INDEX "media_assets_outputs_deleted_at_idx" ON "media_assets" USING btree ("outputs_deleted_at");
  CREATE INDEX "payload_locked_documents_rels_audit_events_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_events_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "audit_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audit_events_fk";
  DROP TABLE "audit_events" CASCADE;
  
  DROP INDEX "media_assets_deleted_at_idx";
  DROP INDEX "media_assets_access_revoked_at_idx";
  DROP INDEX "media_assets_source_deleted_at_idx";
  DROP INDEX "media_assets_outputs_deleted_at_idx";
  DROP INDEX "payload_locked_documents_rels_audit_events_id_idx";
  ALTER TABLE "media_assets" DROP COLUMN "deleted_at";
  ALTER TABLE "media_assets" DROP COLUMN "access_revoked_at";
  ALTER TABLE "media_assets" DROP COLUMN "source_deleted_at";
  ALTER TABLE "media_assets" DROP COLUMN "outputs_deleted_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audit_events_id";
  DROP TYPE "public"."enum_audit_events_action";`)
}
