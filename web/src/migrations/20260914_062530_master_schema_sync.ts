import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// The current master config gained these fields before it gained a follow-up migration.
// Keep that baseline repair independent from the Pilot Member tables so either change
// can be rolled back without destroying the other's data.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_organization_organization_type" AS ENUM('EducationalOrganization', 'Organization');
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
    ALTER TABLE "organization_founders" ADD CONSTRAINT "organization_founders_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "organization_knows_about" ADD CONSTRAINT "organization_knows_about_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "organization" ADD CONSTRAINT "organization_favicon_id_media_id_fk" FOREIGN KEY ("favicon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "organization_founders_order_idx" ON "organization_founders" USING btree ("_order");
    CREATE INDEX "organization_founders_parent_id_idx" ON "organization_founders" USING btree ("_parent_id");
    CREATE INDEX "organization_knows_about_order_idx" ON "organization_knows_about" USING btree ("_order");
    CREATE INDEX "organization_knows_about_parent_id_idx" ON "organization_knows_about" USING btree ("_parent_id");
    CREATE INDEX "organization_favicon_idx" ON "organization" USING btree ("favicon_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "organization" DROP CONSTRAINT "organization_favicon_id_media_id_fk";
    DROP INDEX "organization_favicon_idx";
    ALTER TABLE "organization_founders" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE "organization_knows_about" DISABLE ROW LEVEL SECURITY;
    DROP TABLE "organization_founders" CASCADE;
    DROP TABLE "organization_knows_about" CASCADE;
    ALTER TABLE "media" DROP COLUMN "prefix";
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
    DROP TYPE "public"."enum_organization_organization_type";
  `)
}
