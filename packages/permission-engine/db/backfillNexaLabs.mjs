#!/usr/bin/env node
// One-time historical load from nexalabs' Sanity project into `events`.
// Requires the package to be built first (npm run build, here or via
// build:permission-engine at the repo root) since it imports dist/, and
// requires SANITY_PROJECT_ID / SANITY_DATASET / SANITY_READ_TOKEN plus
// DATABASE_URL — see .env.example.
import pg from 'pg'
import {
  createNexaLabsAdapter,
  createPermissionEngine,
  createPostgresEventStore,
} from '../dist/index.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString })

try {
  const business = await pool.query(`SELECT id FROM businesses WHERE slug = 'nexa-labs'`)
  const businessId = business.rows[0]?.id
  if (!businessId) {
    console.error("No business with slug 'nexa-labs' found — run db:seed first.")
    process.exit(1)
  }

  const adapter = createNexaLabsAdapter()
  const health = await adapter.healthCheck()
  if (!health.ok) {
    console.error('NexaLabsAdapter health check failed:', health.detail)
    process.exit(1)
  }

  const engine = createPermissionEngine({ eventStore: createPostgresEventStore() })
  const summary = await engine.ingestEvents(adapter, businessId, 'backfill')
  console.log('backfill complete:', summary)
} finally {
  await pool.end()
}
