import * as migration_20260907_122519_initial_schema from './20260907_122519_initial_schema'
import * as migration_20260914_062531_pilot_members from './20260914_062531_pilot_members'

export const migrations = [
  {
    up: migration_20260907_122519_initial_schema.up,
    down: migration_20260907_122519_initial_schema.down,
    name: '20260907_122519_initial_schema',
  },
  {
    up: migration_20260914_062531_pilot_members.up,
    down: migration_20260914_062531_pilot_members.down,
    name: '20260914_062531_pilot_members',
  },
]
