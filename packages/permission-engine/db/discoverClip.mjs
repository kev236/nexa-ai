#!/usr/bin/env node
// Step 23: runs the Clip Discovery Agent once, evaluating and storing
// one clip for TrendRush. Needs the package built first
// (npm run build:permission-engine), DATABASE_URL, and ANTHROPIC_API_KEY.
//
// Usage: node db/discoverClip.mjs <business-slug> <source-description> [source-url]
import pg from 'pg'
import { createAnthropicClient, createPostgresClipStore, discoverClipOnce } from '../dist/index.js'

const [, , businessSlug, sourceDescription, sourceUrl] = process.argv

if (!businessSlug || !sourceDescription?.trim()) {
  console.error('Usage: node db/discoverClip.mjs <business-slug> <source-description> [source-url]')
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

  const clipStore = createPostgresClipStore()
  const llmClient = createAnthropicClient()

  const { id, title, recommendation } = await discoverClipOnce(
    clipStore,
    llmClient,
    businessId,
    sourceDescription.trim(),
    sourceUrl?.trim() || undefined
  )
  console.log(`evaluated clip "${title}" (${id}) — ${recommendation}`)
} finally {
  await pool.end()
}
