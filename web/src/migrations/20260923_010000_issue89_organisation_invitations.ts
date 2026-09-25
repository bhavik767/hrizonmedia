import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "organisation_invitations" (
      "id" serial PRIMARY KEY NOT NULL,
      "organisation_id" integer NOT NULL,
      "role" "enum_organisation_memberships_role" NOT NULL,
      "token_hash" varchar NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "accepted_at" timestamp(3) with time zone,
      "accepted_by_id" integer,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organisation_invitations_id" integer;
    ALTER TABLE "organisation_invitations" ADD CONSTRAINT "organisation_invitations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "organisation_invitations" ADD CONSTRAINT "organisation_invitations_accepted_by_id_pilot_members_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."pilot_members"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organisation_invitations_fk" FOREIGN KEY ("organisation_invitations_id") REFERENCES "public"."organisation_invitations"("id") ON DELETE cascade ON UPDATE no action;
    CREATE UNIQUE INDEX "organisation_invitations_token_hash_idx" ON "organisation_invitations" USING btree ("token_hash");
    CREATE INDEX "organisation_invitations_organisation_idx" ON "organisation_invitations" USING btree ("organisation_id");
    CREATE INDEX "organisation_invitations_expires_at_idx" ON "organisation_invitations" USING btree ("expires_at");
    CREATE INDEX "organisation_invitations_updated_at_idx" ON "organisation_invitations" USING btree ("updated_at");
    CREATE INDEX "organisation_invitations_created_at_idx" ON "organisation_invitations" USING btree ("created_at");
    CREATE INDEX "payload_locked_documents_rels_organisation_invitations_id_idx" ON "payload_locked_documents_rels" USING btree ("organisation_invitations_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "payload_locked_documents_rels_organisation_invitations_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organisation_invitations_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organisation_invitations_id";
    DROP INDEX "organisation_invitations_created_at_idx";
    DROP INDEX "organisation_invitations_updated_at_idx";
    DROP INDEX "organisation_invitations_expires_at_idx";
    DROP INDEX "organisation_invitations_organisation_idx";
    DROP INDEX "organisation_invitations_token_hash_idx";
    DROP TABLE "organisation_invitations" CASCADE;
  `)
}
