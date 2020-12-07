import { Pool } from "pg"

const ADVISORY_LOCK_KEY = "097112111113"
const DEFAULT_MIGRATION_TABLE = "apoq_migrations"

export const migrate = async (
  pool: Pool,
  {
    migrationTable = DEFAULT_MIGRATION_TABLE,
    taskTable,
  }: { migrationTable?: string; taskTable: string }
): Promise<void> => {
  const client = await pool.connect()

  await client.query(
    ` BEGIN;
      SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY});
      CREATE TABLE IF NOT EXISTS ${migrationTable} (
        version integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE(version)
      );`
  )

  const completedMigrations = (
    await client.query(`SELECT version FROM ${migrationTable}`)
  ).rows.map((row) => row.version)

  const pendingMigrations = getMigrations(migrationTable, taskTable).filter(
    (migration) => {
      return !completedMigrations.includes(migration.version)
    }
  )

  pendingMigrations.sort((a, b) => a.version - b.version)

  for (const migration of pendingMigrations) {
    await client.query(migration.up)
    await client.query(`INSERT INTO ${migrationTable}(version) VALUES ($1)`, [
      migration.version,
    ])
  }

  await client.query("COMMIT")
  client.release()
}

const getMigrations = (migrationTable: string, taskTable: string) => [
  {
    version: 1,
    up: `
      CREATE TABLE ${taskTable} (
        id bigserial PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        process_at timestamptz NOT NULL DEFAULT NOW(),
        completed_at timestamptz,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        type text NOT NULL,
        state text NOT NULL DEFAULT 'pending'
      );
      CREATE INDEX apoq_tasks_process_at_idx_pending ON ${taskTable}(process_at) WHERE state = 'pending';
      CREATE INDEX apoq_tasks_type_idx ON ${taskTable}(type);
      CREATE INDEX apoq_tasks_state_idx ON ${taskTable}(state);
    `,
  },
  {
    version: 2,
    up: `ALTER TABLE ${taskTable} ADD COLUMN fail_count int NOT NULL DEFAULT 0;`,
  },
]
