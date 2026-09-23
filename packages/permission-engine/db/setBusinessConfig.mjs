#!/usr/bin/env node
// Step 6: shallow-merges a JSON object into businesses.config — e.g. the
// "from" address an executor reads instead of hardcoding one.
//
// Usage: node db/setBusinessConfig.mjs <business-slug> <json-config>
// Example: node db/setBusinessConfig.mjs nexa-labs '{"emailFrom":"Nexa Labs <support@nexalabs.tech>"}'
import pg from 'pg'

const [, , businessSlug, configJson] = process.argv
if (!businessSlug || !configJson) {
  console.error('Usage: node db/setBusinessConfig.mjs <business-slug> <json-config>')
  process.exit(1)
}

let patch
try {
  patch = JSON.parse(configJson)
} catch {
  console.error('config must be valid JSON')
  process.exit(1)
}
if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
  console.error('config must be a JSON object')
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
    `UPDATE businesses SET config = config || $2::jsonb WHERE slug = $1 RETURNING id, config`,
    [businessSlug, JSON.stringify(patch)]
  )
  if (result.rows.length === 0) {
    console.error(`No business with slug '${businessSlug}' found.`)
    process.exit(1)
  }
  console.log('config updated:', result.rows[0])
} finally {
  await client.end()
}
