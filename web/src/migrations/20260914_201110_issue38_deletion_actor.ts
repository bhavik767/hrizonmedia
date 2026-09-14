import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media_assets" ADD COLUMN "deleted_by_id" integer;
  ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_deleted_by_id_pilot_members_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."pilot_members"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "media_assets_deleted_by_idx" ON "media_assets" USING btree ("deleted_by_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_deleted_by_id_pilot_members_id_fk";

  DROP INDEX "media_assets_deleted_by_idx";
  ALTER TABLE "media_assets" DROP COLUMN "deleted_by_id";`)
}
