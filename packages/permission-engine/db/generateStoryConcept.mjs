#!/usr/bin/env node
// Step 19: runs the Story Concept Agent once, generating and storing a
// single nursery-rhyme/short-story concept for Sproutlight. Needs the
// package built first (npm run build:permission-engine), DATABASE_URL,
// and ANTHROPIC_API_KEY.
//
// Usage: node db/generateStoryConcept.mjs <business-slug> <format: song|story> <theme>
import pg from 'pg'
import {
  createAnthropicClient,
  createPostgresStoryConceptStore,
  generateStoryConceptOnce,
} from '../dist/index.js'

const [, , businessSlug, format, ...themeParts] = process.argv
const theme = themeParts.join(' ')

if (!businessSlug || (format !== 'song' && format !== 'story') || !theme.trim()) {
  console.error('Usage: node db/generateStoryConcept.mjs <business-slug> <song|story> <theme>')
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

  const storyConceptStore = createPostgresStoryConceptStore()
  const llmClient = createAnthropicClient()

  const { id, title } = await generateStoryConceptOnce(storyConceptStore, llmClient, businessId, theme.trim(), format)
  console.log(`generated concept "${title}" (${id})`)
} finally {
  await pool.end()
}
