import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "organisation_invitations" ADD COLUMN "name" varchar;
    ALTER TABLE "organisation_invitations" ADD COLUMN "email" varchar;
    CREATE INDEX "organisation_invitations_email_idx" ON "organisation_invitations" USING btree ("email");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "organisation_invitations_email_idx";
    ALTER TABLE "organisation_invitations" DROP COLUMN "email";
    ALTER TABLE "organisation_invitations" DROP COLUMN "name";
  `)
}
