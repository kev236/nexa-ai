#!/usr/bin/env node
// Step 16: the generic way to add a second (third, ...) business row —
// db/seed.mjs stays specifically about bootstrapping the dev seed
// (nexa-labs); this is the reusable operator tool for every business
// after that, matching db/registerAgent.mjs's own shape. Upserts by
// slug, same idempotency convention as every other db/*.mjs script.
//
// Usage: node db/registerBusiness.mjs <slug> <name>
import pg from 'pg'

const [, , slug, ...nameParts] = process.argv
const name = nameParts.join(' ')
if (!slug || !name) {
  console.error('Usage: node db/registerBusiness.mjs <slug> <name>')
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const client = new pg.Client({ connectionString })
await client.connect()

try {
  const result = await client.query(
    `INSERT INTO businesses (slug, name, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, slug, name`,
    [slug, name]
  )
  console.log('business ready:', result.rows[0])
} finally {
  await client.end()
}
