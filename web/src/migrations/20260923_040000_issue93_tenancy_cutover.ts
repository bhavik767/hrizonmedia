import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "pilot_members" RENAME TO "members";
    ALTER TABLE "pilot_members_sessions" RENAME TO "members_sessions";
    ALTER TYPE "public"."enum_pilot_members_status" RENAME TO "enum_members_status";

    ALTER TABLE "members" DROP COLUMN "invitation_token_hash";
    ALTER TABLE "members" DROP COLUMN "invitation_expires_at";
    ALTER TABLE "members" DROP COLUMN "invitation_accepted_at";
    ALTER TABLE "members" DROP COLUMN "role";
    DROP TYPE "public"."enum_pilot_members_role";

    ALTER TABLE "members_sessions" RENAME CONSTRAINT "pilot_members_sessions_parent_id_fk" TO "members_sessions_parent_id_fk";
    ALTER INDEX "pilot_members_sessions_order_idx" RENAME TO "members_sessions_order_idx";
    ALTER INDEX "pilot_members_sessions_parent_id_idx" RENAME TO "members_sessions_parent_id_idx";
    ALTER INDEX "pilot_members_updated_at_idx" RENAME TO "members_updated_at_idx";
    ALTER INDEX "pilot_members_created_at_idx" RENAME TO "members_created_at_idx";
    ALTER INDEX "pilot_members_email_idx" RENAME TO "members_email_idx";

    ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "pilot_members_id" TO "members_id";
    ALTER TABLE "payload_preferences_rels" RENAME COLUMN "pilot_members_id" TO "members_id";
    ALTER TABLE "payload_locked_documents_rels" RENAME CONSTRAINT "payload_locked_documents_rels_pilot_members_fk" TO "payload_locked_documents_rels_members_fk";
    ALTER TABLE "payload_preferences_rels" RENAME CONSTRAINT "payload_preferences_rels_pilot_members_fk" TO "payload_preferences_rels_members_fk";
    ALTER INDEX "payload_locked_documents_rels_pilot_members_id_idx" RENAME TO "payload_locked_documents_rels_members_id_idx";
    ALTER INDEX "payload_preferences_rels_pilot_members_id_idx" RENAME TO "payload_preferences_rels_members_id_idx";

    ALTER TABLE "media_assets" RENAME CONSTRAINT "media_assets_owner_id_pilot_members_id_fk" TO "media_assets_owner_id_members_id_fk";
    ALTER TABLE "media_assets" RENAME CONSTRAINT "media_assets_deleted_by_id_pilot_members_id_fk" TO "media_assets_deleted_by_id_members_id_fk";
    ALTER TABLE "upload_sessions" RENAME CONSTRAINT "upload_sessions_owner_id_pilot_members_id_fk" TO "upload_sessions_owner_id_members_id_fk";
    ALTER TABLE "processing_jobs" RENAME CONSTRAINT "processing_jobs_owner_id_pilot_members_id_fk" TO "processing_jobs_owner_id_members_id_fk";
    ALTER TABLE "playback_grants" RENAME CONSTRAINT "playback_grants_owner_id_pilot_members_id_fk" TO "playback_grants_owner_id_members_id_fk";
    ALTER TABLE "audit_events" RENAME CONSTRAINT "audit_events_member_id_pilot_members_id_fk" TO "audit_events_member_id_members_id_fk";
    ALTER TABLE "audit_events" RENAME CONSTRAINT "audit_events_actor_id_pilot_members_id_fk" TO "audit_events_actor_id_members_id_fk";
    ALTER TABLE "media_operations" RENAME CONSTRAINT "media_operations_updated_by_id_pilot_members_id_fk" TO "media_operations_updated_by_id_members_id_fk";
    ALTER TABLE "organisation_memberships" RENAME CONSTRAINT "organisation_memberships_member_id_pilot_members_id_fk" TO "organisation_memberships_member_id_members_id_fk";
    ALTER TABLE "platform_administrators" RENAME CONSTRAINT "platform_administrators_member_id_pilot_members_id_fk" TO "platform_administrators_member_id_members_id_fk";
    ALTER TABLE "organisations" RENAME CONSTRAINT "organisations_initial_administrator_id_pilot_members_id_fk" TO "organisations_initial_administrator_id_members_id_fk";
    ALTER TABLE "organisation_invitations" RENAME CONSTRAINT "organisation_invitations_accepted_by_id_pilot_members_id_fk" TO "organisation_invitations_accepted_by_id_members_id_fk";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media_assets" RENAME CONSTRAINT "media_assets_owner_id_members_id_fk" TO "media_assets_owner_id_pilot_members_id_fk";
    ALTER TABLE "media_assets" RENAME CONSTRAINT "media_assets_deleted_by_id_members_id_fk" TO "media_assets_deleted_by_id_pilot_members_id_fk";
    ALTER TABLE "upload_sessions" RENAME CONSTRAINT "upload_sessions_owner_id_members_id_fk" TO "upload_sessions_owner_id_pilot_members_id_fk";
    ALTER TABLE "processing_jobs" RENAME CONSTRAINT "processing_jobs_owner_id_members_id_fk" TO "processing_jobs_owner_id_pilot_members_id_fk";
    ALTER TABLE "playback_grants" RENAME CONSTRAINT "playback_grants_owner_id_members_id_fk" TO "playback_grants_owner_id_pilot_members_id_fk";
    ALTER TABLE "audit_events" RENAME CONSTRAINT "audit_events_member_id_members_id_fk" TO "audit_events_member_id_pilot_members_id_fk";
    ALTER TABLE "audit_events" RENAME CONSTRAINT "audit_events_actor_id_members_id_fk" TO "audit_events_actor_id_pilot_members_id_fk";
    ALTER TABLE "media_operations" RENAME CONSTRAINT "media_operations_updated_by_id_members_id_fk" TO "media_operations_updated_by_id_pilot_members_id_fk";
    ALTER TABLE "organisation_memberships" RENAME CONSTRAINT "organisation_memberships_member_id_members_id_fk" TO "organisation_memberships_member_id_pilot_members_id_fk";
    ALTER TABLE "platform_administrators" RENAME CONSTRAINT "platform_administrators_member_id_members_id_fk" TO "platform_administrators_member_id_pilot_members_id_fk";
    ALTER TABLE "organisations" RENAME CONSTRAINT "organisations_initial_administrator_id_members_id_fk" TO "organisations_initial_administrator_id_pilot_members_id_fk";
    ALTER TABLE "organisation_invitations" RENAME CONSTRAINT "organisation_invitations_accepted_by_id_members_id_fk" TO "organisation_invitations_accepted_by_id_pilot_members_id_fk";

    ALTER TABLE "payload_locked_documents_rels" RENAME CONSTRAINT "payload_locked_documents_rels_members_fk" TO "payload_locked_documents_rels_pilot_members_fk";
    ALTER TABLE "payload_preferences_rels" RENAME CONSTRAINT "payload_preferences_rels_members_fk" TO "payload_preferences_rels_pilot_members_fk";
    ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "members_id" TO "pilot_members_id";
    ALTER TABLE "payload_preferences_rels" RENAME COLUMN "members_id" TO "pilot_members_id";
    ALTER INDEX "payload_locked_documents_rels_members_id_idx" RENAME TO "payload_locked_documents_rels_pilot_members_id_idx";
    ALTER INDEX "payload_preferences_rels_members_id_idx" RENAME TO "payload_preferences_rels_pilot_members_id_idx";

    ALTER TABLE "members_sessions" RENAME CONSTRAINT "members_sessions_parent_id_fk" TO "pilot_members_sessions_parent_id_fk";
    ALTER INDEX "members_sessions_order_idx" RENAME TO "pilot_members_sessions_order_idx";
    ALTER INDEX "members_sessions_parent_id_idx" RENAME TO "pilot_members_sessions_parent_id_idx";
    ALTER INDEX "members_updated_at_idx" RENAME TO "pilot_members_updated_at_idx";
    ALTER INDEX "members_created_at_idx" RENAME TO "pilot_members_created_at_idx";
    ALTER INDEX "members_email_idx" RENAME TO "pilot_members_email_idx";

    CREATE TYPE "public"."enum_pilot_members_role" AS ENUM('uploader', 'operator');
    ALTER TABLE "members" ADD COLUMN "role" "enum_pilot_members_role" DEFAULT 'uploader' NOT NULL;
    ALTER TABLE "members" ADD COLUMN "invitation_token_hash" varchar;
    ALTER TABLE "members" ADD COLUMN "invitation_expires_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN "invitation_accepted_at" timestamp(3) with time zone;

    ALTER TABLE "members" RENAME TO "pilot_members";
    ALTER TABLE "members_sessions" RENAME TO "pilot_members_sessions";
    ALTER TYPE "public"."enum_members_status" RENAME TO "enum_pilot_members_status";
    CREATE INDEX "pilot_members_invitation_token_hash_idx" ON "pilot_members" USING btree ("invitation_token_hash");
  `)
}
