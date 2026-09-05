import * as migration_20260905_112757_initial_railway_schema from './20260905_112757_initial_railway_schema'

export const migrations = [
  {
    up: migration_20260905_112757_initial_railway_schema.up,
    down: migration_20260905_112757_initial_railway_schema.down,
    name: '20260905_112757_initial_railway_schema',
  },
]
