import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "playback_grants" (
    "id" serial PRIMARY KEY NOT NULL,
    "playback_grant_id" varchar NOT NULL,
    "asset_id" integer NOT NULL,
    "owner_id" integer NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "delivery_expires_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "media_assets" ADD COLUMN "drm_content_id" varchar;
  ALTER TABLE "media_assets" ADD COLUMN "expires_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "playback_grants_id" integer;
  ALTER TABLE "playback_grants" ADD CONSTRAINT "playback_grants_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "playback_grants" ADD CONSTRAINT "playback_grants_owner_id_pilot_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."pilot_members"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "playback_grants_playback_grant_id_idx" ON "playback_grants" USING btree ("playback_grant_id");
  CREATE INDEX "playback_grants_asset_idx" ON "playback_grants" USING btree ("asset_id");
  CREATE INDEX "playback_grants_owner_idx" ON "playback_grants" USING btree ("owner_id");
  CREATE INDEX "playback_grants_expires_at_idx" ON "playback_grants" USING btree ("expires_at");
  CREATE INDEX "playback_grants_delivery_expires_at_idx" ON "playback_grants" USING btree ("delivery_expires_at");
  CREATE INDEX "playback_grants_updated_at_idx" ON "playback_grants" USING btree ("updated_at");
  CREATE INDEX "playback_grants_created_at_idx" ON "playback_grants" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_playback_grants_fk" FOREIGN KEY ("playback_grants_id") REFERENCES "public"."playback_grants"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "media_assets_drm_content_id_idx" ON "media_assets" USING btree ("drm_content_id");
  CREATE INDEX "media_assets_expires_at_idx" ON "media_assets" USING btree ("expires_at");
  CREATE INDEX "payload_locked_documents_rels_playback_grants_id_idx" ON "payload_locked_documents_rels" USING btree ("playback_grants_id");`)
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_playback_grants_fk";
  ALTER TABLE "playback_grants" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "playback_grants" CASCADE;
  DROP INDEX "media_assets_drm_content_id_idx";
  DROP INDEX "media_assets_expires_at_idx";
  DROP INDEX "payload_locked_documents_rels_playback_grants_id_idx";
  ALTER TABLE "media_assets" DROP COLUMN "drm_content_id";
  ALTER TABLE "media_assets" DROP COLUMN "expires_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "playback_grants_id";`)
}
