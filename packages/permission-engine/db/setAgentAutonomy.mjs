#!/usr/bin/env node
// Step 11: sets an agent's autonomy level and (for level 2+) the
// confidence threshold above which requestAction() auto-approves
// instead of waiting for the owner — see engine.ts's shouldAutoApprove().
// Bumping the level alone does nothing: both a level >= 2 AND an
// explicit minConfidence must be set, on purpose, so promoting an agent
// can't happen by accident.
//
// Usage: node db/setAgentAutonomy.mjs <business-slug> <agent-key> <level> [min-confidence]
// Example (promote): node db/setAgentAutonomy.mjs nexa-labs waitlist-triage 2 0.9
// Example (revert):  node db/setAgentAutonomy.mjs nexa-labs waitlist-triage 1
import pg from 'pg'

const [, , businessSlug, agentKey, levelArg, minConfidenceArg] = process.argv
if (!businessSlug || !agentKey || !levelArg) {
  console.error('Usage: node db/setAgentAutonomy.mjs <business-slug> <agent-key> <level> [min-confidence]')
  process.exit(1)
}

const level = Number(levelArg)
if (!Number.isInteger(level) || level < 1) {
  console.error('level must be a whole number, 1 or higher.')
  process.exit(1)
}

let minConfidence
if (minConfidenceArg !== undefined) {
  minConfidence = Number(minConfidenceArg)
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    console.error('min-confidence must be a number between 0 and 1.')
    process.exit(1)
  }
}

if (level >= 2 && minConfidence === undefined) {
  console.error(
    `level ${level} needs a min-confidence too (e.g. 0.9) — an agent doesn't auto-approve anything until both are set.`
  )
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

  const configPatch = minConfidence === undefined ? {} : { autoApproveMinConfidence: minConfidence }
  const result = await client.query(
    `UPDATE agents SET autonomy_level = $3, config = config || $4::jsonb
     WHERE business_id = $1 AND key = $2
     RETURNING id, key, autonomy_level, config`,
    [businessId, agentKey, level, JSON.stringify(configPatch)]
  )
  if (result.rows.length === 0) {
    console.error(`No agent '${agentKey}' registered for '${businessSlug}' — run db:register-agent first.`)
    process.exit(1)
  }
  console.log('agent autonomy updated:', result.rows[0])
} finally {
  await client.end()
}
