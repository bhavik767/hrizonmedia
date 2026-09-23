import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "media_folders" ("id" serial PRIMARY KEY NOT NULL, "organisation_id" integer NOT NULL, "name" varchar NOT NULL, "owner_id" integer NOT NULL, "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(), "updated_at" timestamp(3) with time zone NOT NULL DEFAULT now());
    ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
    ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
    ALTER TABLE "media_assets" ADD COLUMN "folder_id" integer;
    ALTER TABLE "upload_sessions" ADD COLUMN "folder_id" integer;
    ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "media_folders_organisation_idx" ON "media_folders" USING btree ("organisation_id");
    CREATE INDEX "media_assets_folder_idx" ON "media_assets" USING btree ("folder_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "upload_sessions" DROP CONSTRAINT "upload_sessions_folder_id_media_folders_id_fk";
    ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_folder_id_media_folders_id_fk";
    ALTER TABLE "upload_sessions" DROP COLUMN "folder_id";
    ALTER TABLE "media_assets" DROP COLUMN "folder_id";
    DROP TABLE "media_folders";
  `)
}
