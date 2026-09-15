#!/usr/bin/env node
// Step 16: runs the Creative Agent over one campaign, generating and
// storing a scored batch of content concepts for the owner to review in
// the dashboard. Needs the package built first
// (npm run build:permission-engine), DATABASE_URL, and ANTHROPIC_API_KEY.
//
// Usage: node db/generateConcepts.mjs <business-slug> <campaign-id> [agent-key]
import pg from 'pg'
import {
  createAnthropicClient,
  createPermissionEngine,
  createPostgresCampaignStore,
  createPostgresContentConceptStore,
  generateConceptsOnce,
} from '../dist/index.js'

const [, , businessSlug, campaignId, agentKey = 'creative-agent'] = process.argv
if (!businessSlug || !campaignId) {
  console.error('Usage: node db/generateConcepts.mjs <business-slug> <campaign-id> [agent-key]')
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

  // The agent row is optional here (unlike waitlist-triage/transaction-review) —
  // generateConceptsOnce() only uses it to tag the run for the dashboard,
  // not to look up config, so a missing one degrades to an untagged run
  // rather than blocking the whole command.
  const agent = await pool.query('SELECT id FROM agents WHERE business_id = $1 AND key = $2', [businessId, agentKey])
  const agentId = agent.rows[0]?.id
  if (!agentId) {
    console.warn(`No agent '${agentKey}' registered for '${businessSlug}' — run db:register-agent first. Continuing without one.`)
  }

  const engine = createPermissionEngine({
    campaignStore: createPostgresCampaignStore(),
    contentConceptStore: createPostgresContentConceptStore(),
  })
  const llmClient = createAnthropicClient()

  const { runId, conceptCount } = await generateConceptsOnce(engine, llmClient, businessId, campaignId, agentId)
  console.log(`generated ${conceptCount} concepts (run ${runId})`)
} finally {
  await pool.end()
}
