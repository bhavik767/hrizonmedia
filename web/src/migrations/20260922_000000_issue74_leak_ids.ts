import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "playback_grants" ADD COLUMN "leak_id" varchar;
    ALTER TABLE "playback_grants" ADD COLUMN "leak_id_issued_at" timestamp(3) with time zone;
    UPDATE "playback_grants"
    SET
      "leak_id" = 'lk_' || replace(gen_random_uuid()::text, '-', ''),
      "leak_id_issued_at" = "created_at"
    WHERE "leak_id" IS NULL;
    ALTER TABLE "playback_grants" ALTER COLUMN "leak_id" SET NOT NULL;
    ALTER TABLE "playback_grants" ALTER COLUMN "leak_id_issued_at" SET NOT NULL;
    CREATE UNIQUE INDEX "playback_grants_leak_id_idx" ON "playback_grants" USING btree ("leak_id");
    CREATE INDEX "playback_grants_leak_id_issued_at_idx" ON "playback_grants" USING btree ("leak_id_issued_at");`)
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "playback_grants_leak_id_idx";
    DROP INDEX "playback_grants_leak_id_issued_at_idx";
    ALTER TABLE "playback_grants" DROP COLUMN "leak_id";
    ALTER TABLE "playback_grants" DROP COLUMN "leak_id_issued_at";`)
}
