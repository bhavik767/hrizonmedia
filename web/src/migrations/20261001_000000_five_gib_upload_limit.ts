import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "organisation_settings"
      ALTER COLUMN "maximum_upload_size_bytes"
      SET DEFAULT 5368709120;

    UPDATE "organisation_settings"
    SET "maximum_upload_size_bytes" = 5368709120,
        "updated_at" = NOW()
    WHERE "maximum_upload_size_bytes" = 2147483648;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "organisation_settings"
    SET "maximum_upload_size_bytes" = 2147483648,
        "updated_at" = NOW()
    WHERE "maximum_upload_size_bytes" = 5368709120;

    ALTER TABLE "organisation_settings"
      ALTER COLUMN "maximum_upload_size_bytes"
      SET DEFAULT 2147483648;
  `)
}
