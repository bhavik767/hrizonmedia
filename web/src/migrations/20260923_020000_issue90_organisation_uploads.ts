import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_media_assets_media_protection_policy" AS ENUM('protected', 'standard');
    CREATE TYPE "public"."enum_upload_sessions_media_protection_policy" AS ENUM('protected', 'standard');

    ALTER TABLE "media_assets"
      ADD COLUMN "media_protection_policy" "enum_media_assets_media_protection_policy" DEFAULT 'protected' NOT NULL;
    ALTER TABLE "upload_sessions"
      ADD COLUMN "media_protection_policy" "enum_upload_sessions_media_protection_policy" DEFAULT 'protected' NOT NULL,
      ADD COLUMN "retention_days" numeric;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "upload_sessions" DROP COLUMN "retention_days";
    ALTER TABLE "upload_sessions" DROP COLUMN "media_protection_policy";
    ALTER TABLE "media_assets" DROP COLUMN "media_protection_policy";
    DROP TYPE "public"."enum_upload_sessions_media_protection_policy";
    DROP TYPE "public"."enum_media_assets_media_protection_policy";
  `)
}
