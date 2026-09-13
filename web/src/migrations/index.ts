import * as migration_20260907_122519_initial_schema from './20260907_122519_initial_schema';

export const migrations = [
  {
    up: migration_20260907_122519_initial_schema.up,
    down: migration_20260907_122519_initial_schema.down,
    name: '20260907_122519_initial_schema'
  },
];
