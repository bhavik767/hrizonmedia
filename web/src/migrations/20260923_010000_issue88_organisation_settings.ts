import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "organisations" ADD COLUMN "initial_administrator_id" integer;
    ALTER TABLE "organisations" ADD CONSTRAINT "organisations_initial_administrator_id_pilot_members_id_fk" FOREIGN KEY ("initial_administrator_id") REFERENCES "public"."pilot_members"("id") ON DELETE RESTRICT ON UPDATE no action;
    WITH initial_memberships AS (
      SELECT DISTINCT ON ("organisation_id") "organisation_id", "member_id"
      FROM "organisation_memberships"
      WHERE "role" = 'administrator'
      ORDER BY "organisation_id", "created_at", "id"
    )
    UPDATE "organisations"
    SET "initial_administrator_id" = initial_memberships."member_id"
    FROM initial_memberships
    WHERE "organisations"."id" = initial_memberships."organisation_id";
    ALTER TABLE "organisation_settings" ADD COLUMN "setup_completed_at" timestamp(3) with time zone;
    ALTER TABLE "organisation_settings" ADD COLUMN "logo_data_url" text;
    UPDATE "organisation_settings" SET "setup_completed_at" = "created_at" WHERE "setup_completed_at" IS NULL;
    ALTER TABLE "organisation_settings" ALTER COLUMN "setup_completed_at" SET NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "organisation_settings" DROP COLUMN "logo_data_url";
    ALTER TABLE "organisation_settings" DROP COLUMN "setup_completed_at";
    ALTER TABLE "organisations" DROP CONSTRAINT "organisations_initial_administrator_id_pilot_members_id_fk";
    ALTER TABLE "organisations" DROP COLUMN "initial_administrator_id";
  `)
}
