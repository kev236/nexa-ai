#!/usr/bin/env node
// Seeds exactly one business row and zero agent rows, per the plan doc's
// build order step 2. Idempotent: safe to run more than once.
import pg from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in, or export it directly.')
  process.exit(1)
}

const client = new pg.Client({ connectionString })
await client.connect()

try {
  const result = await client.query(
    `INSERT INTO businesses (slug, name, status)
     VALUES ('nexa-labs', 'Nexa Labs', 'active')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, slug`
  )
  console.log('seeded business:', result.rows[0])
} finally {
  await client.end()
}
