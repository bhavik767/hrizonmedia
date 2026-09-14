import * as migration_20260907_122519_initial_schema from './20260907_122519_initial_schema'
import * as migration_20260914_062530_master_schema_sync from './20260914_062530_master_schema_sync'
import * as migration_20260914_062531_pilot_members from './20260914_062531_pilot_members'
import * as migration_20260914_070412_issue33_media_assets from './20260914_070412_issue33_media_assets'
import * as migration_20260914_092953_issue33_processing_job_id from './20260914_092953_issue33_processing_job_id'
import * as migration_20260914_114010_issue35_reliable_processing_jobs from './20260914_114010_issue35_reliable_processing_jobs'
import * as migration_20260914_115815_issue35_processing_worker from './20260914_115815_issue35_processing_worker'

export const migrations = [
  {
    up: migration_20260907_122519_initial_schema.up,
    down: migration_20260907_122519_initial_schema.down,
    name: '20260907_122519_initial_schema',
  },
  {
    up: migration_20260914_062530_master_schema_sync.up,
    down: migration_20260914_062530_master_schema_sync.down,
    name: '20260914_062530_master_schema_sync',
  },
  {
    up: migration_20260914_062531_pilot_members.up,
    down: migration_20260914_062531_pilot_members.down,
    name: '20260914_062531_pilot_members',
  },
  {
    up: migration_20260914_070412_issue33_media_assets.up,
    down: migration_20260914_070412_issue33_media_assets.down,
    name: '20260914_070412_issue33_media_assets',
  },
  {
    up: migration_20260914_092953_issue33_processing_job_id.up,
    down: migration_20260914_092953_issue33_processing_job_id.down,
    name: '20260914_092953_issue33_processing_job_id',
  },
  {
    up: migration_20260914_114010_issue35_reliable_processing_jobs.up,
    down: migration_20260914_114010_issue35_reliable_processing_jobs.down,
    name: '20260914_114010_issue35_reliable_processing_jobs',
  },
  {
    up: migration_20260914_115815_issue35_processing_worker.up,
    down: migration_20260914_115815_issue35_processing_worker.down,
    name: '20260914_115815_issue35_processing_worker',
  },
]
