#!/usr/bin/env node
// Step 16: imports one or more raw campaigns through the Campaign Agent,
// which normalizes each into the structured shape CampaignStore expects.
// Needs the package built first (npm run build:permission-engine),
// DATABASE_URL, and ANTHROPIC_API_KEY.
//
// A .txt file (or any non-.csv path) is treated as one raw campaign — its
// whole content becomes the Campaign Agent's input, no externalId.
//
// A .csv file imports one campaign per line, split on the FIRST comma
// only: "<externalId>,<raw campaign text>". This is deliberately not a
// full CSV parser (no quoted-field/embedded-comma support) — good enough
// for a simple externalId+text export, not a general CSV import tool.
//
// Usage: node db/importCampaign.mjs <business-slug> <path-to-file>
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { createAnthropicClient, createPermissionEngine, createPostgresCampaignStore, importCampaignOnce } from '../dist/index.js'

const [, , businessSlug, filePath] = process.argv
if (!businessSlug || !filePath) {
  console.error('Usage: node db/importCampaign.mjs <business-slug> <path-to-file>')
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString })

try {
  const business = await pool.query('SELECT id FROM businesses WHERE slug = $1', [businessSlug])
  const businessId = business.rows[0]?.id
  if (!businessId) {
    console.error(`No business with slug '${businessSlug}' found — run db:register-business first.`)
    process.exit(1)
  }

  const fileContent = readFileSync(filePath, 'utf8')
  const rows = filePath.endsWith('.csv')
    ? fileContent
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const commaIndex = line.indexOf(',')
          return commaIndex === -1
            ? { externalId: undefined, rawInput: line }
            : { externalId: line.slice(0, commaIndex).trim(), rawInput: line.slice(commaIndex + 1).trim() }
        })
    : [{ externalId: undefined, rawInput: fileContent }]

  const engine = createPermissionEngine({ campaignStore: createPostgresCampaignStore() })
  const llmClient = createAnthropicClient()

  for (const row of rows) {
    const { campaignId, inserted, normalization } = await importCampaignOnce(
      engine,
      llmClient,
      businessId,
      row.rawInput,
      row.externalId
    )
    console.log(
      `${inserted ? 'imported' : 'already existed'}: ${normalization.product} (campaign ${campaignId}, confidence ${normalization.confidence})`
    )
  }
} finally {
  await pool.end()
}
