import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pilot_members_role" AS ENUM('uploader', 'operator');
  CREATE TYPE "public"."enum_pilot_members_status" AS ENUM('active', 'disabled');
  CREATE TYPE "public"."enum_organization_organization_type" AS ENUM('EducationalOrganization', 'Organization');
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
  
  CREATE TABLE "organization_founders" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"title" varchar
  );
  
  CREATE TABLE "organization_knows_about" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"topic" varchar NOT NULL
  );
  
  ALTER TABLE "media" ADD COLUMN "prefix" varchar DEFAULT '';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pilot_members_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "pilot_members_id" integer;
  ALTER TABLE "organization" ADD COLUMN "favicon_id" integer;
  ALTER TABLE "organization" ADD COLUMN "description" varchar;
  ALTER TABLE "organization" ADD COLUMN "legal_name" varchar;
  ALTER TABLE "organization" ADD COLUMN "alternate_name" varchar;
  ALTER TABLE "organization" ADD COLUMN "email" varchar;
  ALTER TABLE "organization" ADD COLUMN "telephone" varchar;
  ALTER TABLE "organization" ADD COLUMN "founding_date" timestamp(3) with time zone;
  ALTER TABLE "organization" ADD COLUMN "slogan" varchar;
  ALTER TABLE "organization" ADD COLUMN "address_street_address" varchar;
  ALTER TABLE "organization" ADD COLUMN "address_address_locality" varchar;
  ALTER TABLE "organization" ADD COLUMN "address_address_region" varchar;
  ALTER TABLE "organization" ADD COLUMN "address_postal_code" varchar;
  ALTER TABLE "organization" ADD COLUMN "address_address_country" varchar DEFAULT 'IN';
  ALTER TABLE "organization" ADD COLUMN "organization_type" "enum_organization_organization_type" DEFAULT 'EducationalOrganization';
  ALTER TABLE "pilot_members_sessions" ADD CONSTRAINT "pilot_members_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pilot_members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organization_founders" ADD CONSTRAINT "organization_founders_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organization_knows_about" ADD CONSTRAINT "organization_knows_about_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pilot_members_sessions_order_idx" ON "pilot_members_sessions" USING btree ("_order");
  CREATE INDEX "pilot_members_sessions_parent_id_idx" ON "pilot_members_sessions" USING btree ("_parent_id");
  CREATE INDEX "pilot_members_invitation_token_hash_idx" ON "pilot_members" USING btree ("invitation_token_hash");
  CREATE INDEX "pilot_members_updated_at_idx" ON "pilot_members" USING btree ("updated_at");
  CREATE INDEX "pilot_members_created_at_idx" ON "pilot_members" USING btree ("created_at");
  CREATE UNIQUE INDEX "pilot_members_email_idx" ON "pilot_members" USING btree ("email");
  CREATE INDEX "organization_founders_order_idx" ON "organization_founders" USING btree ("_order");
  CREATE INDEX "organization_founders_parent_id_idx" ON "organization_founders" USING btree ("_parent_id");
  CREATE INDEX "organization_knows_about_order_idx" ON "organization_knows_about" USING btree ("_order");
  CREATE INDEX "organization_knows_about_parent_id_idx" ON "organization_knows_about" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pilot_members_fk" FOREIGN KEY ("pilot_members_id") REFERENCES "public"."pilot_members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_pilot_members_fk" FOREIGN KEY ("pilot_members_id") REFERENCES "public"."pilot_members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "organization" ADD CONSTRAINT "organization_favicon_id_media_id_fk" FOREIGN KEY ("favicon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_pilot_members_id_idx" ON "payload_locked_documents_rels" USING btree ("pilot_members_id");
  CREATE INDEX "payload_preferences_rels_pilot_members_id_idx" ON "payload_preferences_rels" USING btree ("pilot_members_id");
  CREATE INDEX "organization_favicon_idx" ON "organization" USING btree ("favicon_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pilot_members_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pilot_members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organization_founders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organization_knows_about" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pilot_members_sessions" CASCADE;
  DROP TABLE "pilot_members" CASCADE;
  DROP TABLE "organization_founders" CASCADE;
  DROP TABLE "organization_knows_about" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pilot_members_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_pilot_members_fk";
  
  ALTER TABLE "organization" DROP CONSTRAINT "organization_favicon_id_media_id_fk";
  
  DROP INDEX "payload_locked_documents_rels_pilot_members_id_idx";
  DROP INDEX "payload_preferences_rels_pilot_members_id_idx";
  DROP INDEX "organization_favicon_idx";
  ALTER TABLE "media" DROP COLUMN "prefix";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pilot_members_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "pilot_members_id";
  ALTER TABLE "organization" DROP COLUMN "favicon_id";
  ALTER TABLE "organization" DROP COLUMN "description";
  ALTER TABLE "organization" DROP COLUMN "legal_name";
  ALTER TABLE "organization" DROP COLUMN "alternate_name";
  ALTER TABLE "organization" DROP COLUMN "email";
  ALTER TABLE "organization" DROP COLUMN "telephone";
  ALTER TABLE "organization" DROP COLUMN "founding_date";
  ALTER TABLE "organization" DROP COLUMN "slogan";
  ALTER TABLE "organization" DROP COLUMN "address_street_address";
  ALTER TABLE "organization" DROP COLUMN "address_address_locality";
  ALTER TABLE "organization" DROP COLUMN "address_address_region";
  ALTER TABLE "organization" DROP COLUMN "address_postal_code";
  ALTER TABLE "organization" DROP COLUMN "address_address_country";
  ALTER TABLE "organization" DROP COLUMN "organization_type";
  DROP TYPE "public"."enum_pilot_members_role";
  DROP TYPE "public"."enum_pilot_members_status";
  DROP TYPE "public"."enum_organization_organization_type";`)
}
