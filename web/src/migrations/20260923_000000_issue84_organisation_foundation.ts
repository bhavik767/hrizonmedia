import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_organisations_status" AS ENUM('active', 'deleted');
    CREATE TYPE "public"."enum_organisation_memberships_role" AS ENUM('administrator', 'publisher', 'viewer');
    CREATE TYPE "public"."enum_organisation_memberships_status" AS ENUM('active', 'disabled');
    CREATE TYPE "public"."enum_media_access_status" AS ENUM('active', 'revoked');
    CREATE TYPE "public"."enum_organisation_settings_drm_default" AS ENUM('protected', 'standard');
    CREATE TYPE "public"."enum_platform_administrators_status" AS ENUM('active', 'disabled');

    CREATE TABLE "organisations" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "status" "enum_organisations_status" DEFAULT 'active' NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "organisation_memberships" (
      "id" serial PRIMARY KEY NOT NULL,
      "organisation_id" integer NOT NULL,
      "member_id" integer NOT NULL,
      "role" "enum_organisation_memberships_role" NOT NULL,
      "status" "enum_organisation_memberships_status" DEFAULT 'active' NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "media_access" (
      "id" serial PRIMARY KEY NOT NULL,
      "asset_id" integer NOT NULL,
      "membership_id" integer NOT NULL,
      "status" "enum_media_access_status" DEFAULT 'active' NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "organisation_settings" (
      "id" serial PRIMARY KEY NOT NULL,
      "organisation_id" integer NOT NULL,
      "drm_default" "enum_organisation_settings_drm_default" DEFAULT 'protected' NOT NULL,
      "drm_required" boolean DEFAULT false,
      "default_retention_days" numeric DEFAULT 30 NOT NULL,
      "maximum_upload_size_bytes" numeric DEFAULT 2147483648 NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "platform_administrators" (
      "id" serial PRIMARY KEY NOT NULL,
      "member_id" integer NOT NULL,
      "status" "enum_platform_administrators_status" DEFAULT 'active' NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "media_assets" ADD COLUMN "organisation_id" integer;
    ALTER TABLE "upload_sessions" ADD COLUMN "organisation_id" integer;
    ALTER TABLE "processing_jobs" ADD COLUMN "organisation_id" integer;
    ALTER TABLE "playback_grants" ADD COLUMN "organisation_id" integer;
    ALTER TABLE "audit_events" ADD COLUMN "organisation_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organisations_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organisation_memberships_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organisation_settings_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "platform_administrators_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_access_id" integer;
    ALTER TYPE "public"."enum_audit_events_action" ADD VALUE IF NOT EXISTS 'platform_recovery_accessed';

    ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_member_id_pilot_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."pilot_members"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "media_access" ADD CONSTRAINT "media_access_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "media_access" ADD CONSTRAINT "media_access_membership_id_organisation_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."organisation_memberships"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "organisation_settings" ADD CONSTRAINT "organisation_settings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "platform_administrators" ADD CONSTRAINT "platform_administrators_member_id_pilot_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."pilot_members"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "playback_grants" ADD CONSTRAINT "playback_grants_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organisations_fk" FOREIGN KEY ("organisations_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organisation_memberships_fk" FOREIGN KEY ("organisation_memberships_id") REFERENCES "public"."organisation_memberships"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organisation_settings_fk" FOREIGN KEY ("organisation_settings_id") REFERENCES "public"."organisation_settings"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_platform_administrators_fk" FOREIGN KEY ("platform_administrators_id") REFERENCES "public"."platform_administrators"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_access_fk" FOREIGN KEY ("media_access_id") REFERENCES "public"."media_access"("id") ON DELETE cascade ON UPDATE no action;

    CREATE INDEX "organisations_updated_at_idx" ON "organisations" USING btree ("updated_at");
    CREATE INDEX "organisations_created_at_idx" ON "organisations" USING btree ("created_at");
    CREATE INDEX "organisation_memberships_organisation_idx" ON "organisation_memberships" USING btree ("organisation_id");
    CREATE INDEX "organisation_memberships_member_idx" ON "organisation_memberships" USING btree ("member_id");
    CREATE UNIQUE INDEX "organisation_memberships_organisation_member_idx" ON "organisation_memberships" USING btree ("organisation_id", "member_id");
    CREATE INDEX "organisation_memberships_updated_at_idx" ON "organisation_memberships" USING btree ("updated_at");
    CREATE INDEX "organisation_memberships_created_at_idx" ON "organisation_memberships" USING btree ("created_at");
    CREATE INDEX "media_access_asset_idx" ON "media_access" USING btree ("asset_id");
    CREATE INDEX "media_access_membership_idx" ON "media_access" USING btree ("membership_id");
    CREATE UNIQUE INDEX "media_access_asset_membership_idx" ON "media_access" USING btree ("asset_id", "membership_id");
    CREATE INDEX "media_access_updated_at_idx" ON "media_access" USING btree ("updated_at");
    CREATE INDEX "media_access_created_at_idx" ON "media_access" USING btree ("created_at");
    CREATE UNIQUE INDEX "organisation_settings_organisation_idx" ON "organisation_settings" USING btree ("organisation_id");
    CREATE INDEX "organisation_settings_updated_at_idx" ON "organisation_settings" USING btree ("updated_at");
    CREATE INDEX "organisation_settings_created_at_idx" ON "organisation_settings" USING btree ("created_at");
    CREATE UNIQUE INDEX "platform_administrators_member_idx" ON "platform_administrators" USING btree ("member_id");
    CREATE INDEX "platform_administrators_updated_at_idx" ON "platform_administrators" USING btree ("updated_at");
    CREATE INDEX "platform_administrators_created_at_idx" ON "platform_administrators" USING btree ("created_at");
    CREATE INDEX "media_assets_organisation_idx" ON "media_assets" USING btree ("organisation_id");
    CREATE INDEX "upload_sessions_organisation_idx" ON "upload_sessions" USING btree ("organisation_id");
    CREATE INDEX "processing_jobs_organisation_idx" ON "processing_jobs" USING btree ("organisation_id");
    CREATE INDEX "playback_grants_organisation_idx" ON "playback_grants" USING btree ("organisation_id");
    CREATE INDEX "audit_events_organisation_idx" ON "audit_events" USING btree ("organisation_id");
    CREATE INDEX "payload_locked_documents_rels_organisations_id_idx" ON "payload_locked_documents_rels" USING btree ("organisations_id");
    CREATE INDEX "payload_locked_documents_rels_organisation_memberships_id_idx" ON "payload_locked_documents_rels" USING btree ("organisation_memberships_id");
    CREATE INDEX "payload_locked_documents_rels_organisation_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("organisation_settings_id");
    CREATE INDEX "payload_locked_documents_rels_platform_administrators_id_idx" ON "payload_locked_documents_rels" USING btree ("platform_administrators_id");
    CREATE INDEX "payload_locked_documents_rels_media_access_id_idx" ON "payload_locked_documents_rels" USING btree ("media_access_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "audit_events_organisation_idx";
    DROP INDEX "payload_locked_documents_rels_media_access_id_idx";
    DROP INDEX "payload_locked_documents_rels_platform_administrators_id_idx";
    DROP INDEX "payload_locked_documents_rels_organisation_settings_id_idx";
    DROP INDEX "payload_locked_documents_rels_organisation_memberships_id_idx";
    DROP INDEX "payload_locked_documents_rels_organisations_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_access_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_platform_administrators_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organisation_settings_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organisation_memberships_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organisations_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_access_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "platform_administrators_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organisation_settings_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organisation_memberships_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organisations_id";
    DROP INDEX "playback_grants_organisation_idx";
    DROP INDEX "processing_jobs_organisation_idx";
    DROP INDEX "upload_sessions_organisation_idx";
    DROP INDEX "media_assets_organisation_idx";
    ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_organisation_id_organisations_id_fk";
    ALTER TABLE "playback_grants" DROP CONSTRAINT "playback_grants_organisation_id_organisations_id_fk";
    ALTER TABLE "processing_jobs" DROP CONSTRAINT "processing_jobs_organisation_id_organisations_id_fk";
    ALTER TABLE "upload_sessions" DROP CONSTRAINT "upload_sessions_organisation_id_organisations_id_fk";
    ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_organisation_id_organisations_id_fk";
    ALTER TABLE "audit_events" DROP COLUMN "organisation_id";
    ALTER TABLE "playback_grants" DROP COLUMN "organisation_id";
    ALTER TABLE "processing_jobs" DROP COLUMN "organisation_id";
    ALTER TABLE "upload_sessions" DROP COLUMN "organisation_id";
    ALTER TABLE "media_assets" DROP COLUMN "organisation_id";
    DROP TABLE "media_access" CASCADE;
    DROP TABLE "organisation_settings" CASCADE;
    DROP TABLE "platform_administrators" CASCADE;
    DROP TABLE "organisation_memberships" CASCADE;
    DROP TABLE "organisations" CASCADE;
    DROP TYPE "public"."enum_media_access_status";
    DROP TYPE "public"."enum_organisation_settings_drm_default";
    DROP TYPE "public"."enum_platform_administrators_status";
    DROP TYPE "public"."enum_organisation_memberships_status";
    DROP TYPE "public"."enum_organisation_memberships_role";
    DROP TYPE "public"."enum_organisations_status";
    -- PostgreSQL enum values cannot be removed safely while audit rows may reference them.
  `)
}
