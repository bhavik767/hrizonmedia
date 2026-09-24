import 'server-only'

import { Pool } from 'pg'

const stagingSchemaRecovery = `
  CREATE TABLE IF NOT EXISTS "media_folders" (
    "id" serial PRIMARY KEY NOT NULL,
    "organisation_id" integer NOT NULL,
    "name" varchar NOT NULL,
    "owner_id" integer NOT NULL,
    "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now()
  );
  ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "folder_id" integer;
  ALTER TABLE "upload_sessions" ADD COLUMN IF NOT EXISTS "folder_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_folders_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN IF NOT EXISTS "media_folders_id" integer;
  CREATE INDEX IF NOT EXISTS "media_folders_organisation_idx" ON "media_folders" USING btree ("organisation_id");
  CREATE INDEX IF NOT EXISTS "media_assets_folder_idx" ON "media_assets" USING btree ("folder_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_folders_id_idx" ON "payload_locked_documents_rels" USING btree ("media_folders_id");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_media_folders_id_idx" ON "payload_preferences_rels" USING btree ("media_folders_id");
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_folders_organisation_id_organisations_id_fk') THEN
      ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_folders_owner_id_members_id_fk') THEN
      ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_folder_id_media_folders_id_fk') THEN
      ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'upload_sessions_folder_id_media_folders_id_fk') THEN
      ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_media_folders_fk') THEN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_folders_fk" FOREIGN KEY ("media_folders_id") REFERENCES "public"."media_folders"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_preferences_rels_media_folders_fk') THEN
      ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_media_folders_fk" FOREIGN KEY ("media_folders_id") REFERENCES "public"."media_folders"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$;
`

let recovering: Promise<void> | undefined

export async function recoverStagingMediaFolderSchema(): Promise<void> {
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging') return
  if (!process.env.DATABASE_URL) throw new Error('Staging schema recovery requires DATABASE_URL.')

  recovering ??= (async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    try {
      await pool.query(stagingSchemaRecovery)
      console.info('Staging media-folder schema recovery completed.')
    } finally {
      await pool.end()
    }
  })()
  return recovering
}
