#!/usr/bin/env node
// Agents are config, not code (invariant #5) — this is the one generic
// way to create/update an agent row, reusable for any future agent, not
// just the waitlist-triage one. Upserts by (business_slug, key).
//
// Usage: node db/registerAgent.mjs <business-slug> <key> <role>
import pg from 'pg'

const [, , businessSlug, key, ...roleParts] = process.argv
const role = roleParts.join(' ')
if (!businessSlug || !key || !role) {
  console.error('Usage: node db/registerAgent.mjs <business-slug> <key> <role>')
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
  const business = await client.query('SELECT id FROM businesses WHERE slug = $1', [businessSlug])
  const businessId = business.rows[0]?.id
  if (!businessId) {
    console.error(`No business with slug '${businessSlug}' found.`)
    process.exit(1)
  }

  const result = await client.query(
    `INSERT INTO agents (business_id, key, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (business_id, key) DO UPDATE SET role = EXCLUDED.role
     RETURNING id, key, role`,
    [businessId, key, role]
  )
  console.log('agent ready:', result.rows[0])
} finally {
  await client.end()
}
