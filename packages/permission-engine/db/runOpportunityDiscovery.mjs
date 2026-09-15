#!/usr/bin/env node
// Step 17: runs the Opportunity Discovery Agent, proposing up to 3 new
// scored opportunities and submitting each through requestAction() as
// actionType 'propose_opportunity' — auto-executed under step 18's
// policy (proposing an idea isn't money), writing straight into the
// opportunities table the owner already reviews on the dashboard. Needs
// the package built first (npm run build:permission-engine),
// DATABASE_URL, and ANTHROPIC_API_KEY.
//
// Usage: node db/runOpportunityDiscovery.mjs <business-slug> <agent-key>
import pg from 'pg'
import {
  createAnthropicClient,
  createPermissionEngine,
  createPostgresAgentStore,
  createPostgresApprovalStore,
  createPostgresAuditLogStore,
  createPostgresOpportunityStore,
  registerProposeOpportunityExecutor,
  runOpportunityDiscoveryOnce,
} from '../dist/index.js'

const [, , businessSlug = 'nexa-labs', agentKey = 'opportunity-discovery'] = process.argv

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
    console.error(`No business with slug '${businessSlug}' found — run db:seed first.`)
    process.exit(1)
  }

  const agent = await pool.query('SELECT id FROM agents WHERE business_id = $1 AND key = $2', [
    businessId,
    agentKey,
  ])
  const agentId = agent.rows[0]?.id
  if (!agentId) {
    console.error(
      `No agent '${agentKey}' registered for '${businessSlug}' — run db:register-agent first.`
    )
    process.exit(1)
  }

  const opportunityStore = createPostgresOpportunityStore()
  registerProposeOpportunityExecutor(opportunityStore)

  const engine = createPermissionEngine({
    auditStore: createPostgresAuditLogStore(),
    approvalStore: createPostgresApprovalStore(),
    agentStore: createPostgresAgentStore(),
    opportunityStore,
  })
  const llmClient = createAnthropicClient()

  const { proposed, outcomes } = await runOpportunityDiscoveryOnce(engine, llmClient, businessId, agentId)
  console.log(`proposed ${proposed} opportunit${proposed === 1 ? 'y' : 'ies'}:`)
  for (const o of outcomes) {
    console.log(`  - ${o.name} (${o.status})`)
  }
} finally {
  await pool.end()
}
