import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_audit_events_action"
    ADD VALUE IF NOT EXISTS 'playback_leak_id_issued' BEFORE 'playback_licence_acquired';
  `)
}

export async function down({ db: _db }: MigrateDownArgs): Promise<void> {
  // PostgreSQL enum values cannot be removed safely while audit rows may reference them.
}
