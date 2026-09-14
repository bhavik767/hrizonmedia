import * as migration_20260907_122519_initial_schema from './20260907_122519_initial_schema';
import * as migration_20260914_062530_master_schema_sync from './20260914_062530_master_schema_sync';
import * as migration_20260914_062531_pilot_members from './20260914_062531_pilot_members';
import * as migration_20260914_070412_issue33_media_assets from './20260914_070412_issue33_media_assets';
import * as migration_20260914_092953_issue33_processing_job_id from './20260914_092953_issue33_processing_job_id';
import * as migration_20260914_105053_issue34_resumable_uploads from './20260914_105053_issue34_resumable_uploads';
import * as migration_20260914_123628 from './20260914_123628';
import * as migration_20260914_131520_issue36_playback_grants from './20260914_131520_issue36_playback_grants';
import * as migration_20260914_195615_issue38_safe_retention_deletion from './20260914_195615_issue38_safe_retention_deletion';
import * as migration_20260914_201110_issue38_deletion_actor from './20260914_201110_issue38_deletion_actor';
import * as migration_20260914_220400_issue39_operator_oversight from './20260914_220400_issue39_operator_oversight';

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
    up: migration_20260914_105053_issue34_resumable_uploads.up,
    down: migration_20260914_105053_issue34_resumable_uploads.down,
    name: '20260914_105053_issue34_resumable_uploads',
  },
  {
    up: migration_20260914_123628.up,
    down: migration_20260914_123628.down,
    name: '20260914_123628',
  },
  {
    up: migration_20260914_131520_issue36_playback_grants.up,
    down: migration_20260914_131520_issue36_playback_grants.down,
    name: '20260914_131520_issue36_playback_grants',
  },
  {
    up: migration_20260914_195615_issue38_safe_retention_deletion.up,
    down: migration_20260914_195615_issue38_safe_retention_deletion.down,
    name: '20260914_195615_issue38_safe_retention_deletion',
  },
  {
    up: migration_20260914_201110_issue38_deletion_actor.up,
    down: migration_20260914_201110_issue38_deletion_actor.down,
    name: '20260914_201110_issue38_deletion_actor',
  },
  {
    up: migration_20260914_220400_issue39_operator_oversight.up,
    down: migration_20260914_220400_issue39_operator_oversight.down,
    name: '20260914_220400_issue39_operator_oversight'
  },
];
