import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_pilot_members_role" AS ENUM('uploader', 'operator');
    CREATE TYPE "public"."enum_pilot_members_status" AS ENUM('active', 'disabled');
    CREATE TABLE "pilot_members_sessions" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "created_at" timestamp(3) with time zone,
      "expires_at" timestamp(3) with time zone NOT NULL
    );
    CREATE TABLE "pilot_members" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "role" "enum_pilot_members_role" NOT NULL,
      "status" "enum_pilot_members_status" DEFAULT 'active' NOT NULL,
      "invitation_token_hash" varchar,
      "invitation_expires_at" timestamp(3) with time zone,
      "invitation_accepted_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "email" varchar NOT NULL,
      "reset_password_token" varchar,
      "reset_password_expiration" timestamp(3) with time zone,
      "salt" varchar,
      "hash" varchar,
      "login_attempts" numeric DEFAULT 0,
      "lock_until" timestamp(3) with time zone
    );
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pilot_members_id" integer;
    ALTER TABLE "payload_preferences_rels" ADD COLUMN "pilot_members_id" integer;
    ALTER TABLE "pilot_members_sessions" ADD CONSTRAINT "pilot_members_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pilot_members"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "pilot_members_sessions_order_idx" ON "pilot_members_sessions" USING btree ("_order");
    CREATE INDEX "pilot_members_sessions_parent_id_idx" ON "pilot_members_sessions" USING btree ("_parent_id");
    CREATE INDEX "pilot_members_invitation_token_hash_idx" ON "pilot_members" USING btree ("invitation_token_hash");
    CREATE INDEX "pilot_members_updated_at_idx" ON "pilot_members" USING btree ("updated_at");
    CREATE INDEX "pilot_members_created_at_idx" ON "pilot_members" USING btree ("created_at");
    CREATE UNIQUE INDEX "pilot_members_email_idx" ON "pilot_members" USING btree ("email");
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pilot_members_fk" FOREIGN KEY ("pilot_members_id") REFERENCES "public"."pilot_members"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_pilot_members_fk" FOREIGN KEY ("pilot_members_id") REFERENCES "public"."pilot_members"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_pilot_members_id_idx" ON "payload_locked_documents_rels" USING btree ("pilot_members_id");
    CREATE INDEX "payload_preferences_rels_pilot_members_id_idx" ON "payload_preferences_rels" USING btree ("pilot_members_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pilot_members_fk";
    ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_pilot_members_fk";
    DROP INDEX "payload_locked_documents_rels_pilot_members_id_idx";
    DROP INDEX "payload_preferences_rels_pilot_members_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pilot_members_id";
    ALTER TABLE "payload_preferences_rels" DROP COLUMN "pilot_members_id";
    ALTER TABLE "pilot_members_sessions" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE "pilot_members" DISABLE ROW LEVEL SECURITY;
    DROP TABLE "pilot_members_sessions" CASCADE;
    DROP TABLE "pilot_members" CASCADE;
    DROP TYPE "public"."enum_pilot_members_role";
    DROP TYPE "public"."enum_pilot_members_status";
  `)
}
