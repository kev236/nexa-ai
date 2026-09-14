#!/usr/bin/env node
// Forward-only migration runner. Never edit a migration that has already
// run — add a new numbered file instead (project convention). Applies
// pending migrations in filename order, each in its own transaction, and
// records what's been applied in schema_migrations so re-running is a
// no-op. This is deploy-time tooling, run by a trusted operator with
// DATABASE_URL — not something agent code ever invokes.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const migrationsDir = fileURLToPath(new URL('./migrations', import.meta.url))

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in, or export it directly.')
  process.exit(1)
}

const client = new pg.Client({ connectionString })
await client.connect()

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const appliedResult = await client.query('SELECT name FROM schema_migrations')
  const applied = new Set(appliedResult.rows.map((row) => row.name))

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  let appliedCount = 0
  for (const file of files) {
    if (applied.has(file)) continue

    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    console.log(`applying ${file}`)
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      appliedCount++
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`migration ${file} failed, rolled back: ${err.message}`, { cause: err })
    }
  }

  console.log(appliedCount > 0 ? `applied ${appliedCount} migration(s)` : 'schema is up to date')
} finally {
  await client.end()
}
