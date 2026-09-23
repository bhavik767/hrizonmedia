import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_audit_events_action" ADD VALUE IF NOT EXISTS 'media_access_granted';
    ALTER TYPE "public"."enum_audit_events_action" ADD VALUE IF NOT EXISTS 'media_access_revoked';
    CREATE UNIQUE INDEX IF NOT EXISTS "media_access_asset_membership_idx"
      ON "media_access" USING btree ("asset_id", "membership_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "media_access_asset_membership_idx";
  `)
}
