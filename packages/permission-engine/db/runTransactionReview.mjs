#!/usr/bin/env node
// Step 14: runs the transaction-review agent over transactions that don't
// have a decision yet (transactions.decision_id IS NULL), reviews each via
// Claude, and — only when it's judged worth flagging — submits a drafted
// alert to the owner through requestAction() as actionType 'send_email'.
// Needs the package built first (npm run build:permission-engine),
// DATABASE_URL, ANTHROPIC_API_KEY, RESEND_API_KEY, and the business's
// config.emailFrom set (db/setBusinessConfig.mjs) for approving the alert
// to actually send.
//
// Usage: node db/runTransactionReview.mjs <business-slug> <agent-key>
import pg from 'pg'
import {
  createAnthropicClient,
  createPermissionEngine,
  createPostgresApprovalStore,
  createPostgresAuditLogStore,
  createPostgresDecisionStore,
  createPostgresTransactionStore,
  registerSendEmailExecutor,
  runTransactionReviewOnce,
} from '../dist/index.js'

registerSendEmailExecutor()

const [, , businessSlug = 'nexa-labs', agentKey = 'transaction-review'] = process.argv

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

  const owner = await pool.query('SELECT email FROM owners ORDER BY created_at ASC LIMIT 1')
  const ownerEmail = owner.rows[0]?.email
  if (!ownerEmail) {
    console.error('No owner account exists — run db:create-owner first.')
    process.exit(1)
  }

  const engine = createPermissionEngine({
    auditStore: createPostgresAuditLogStore(),
    approvalStore: createPostgresApprovalStore(),
    transactionStore: createPostgresTransactionStore(),
    decisionStore: createPostgresDecisionStore(),
  })
  const llmClient = createAnthropicClient()

  const summary = await runTransactionReviewOnce(engine, llmClient, businessId, agentId, ownerEmail)
  console.log(`done: ${summary.reviewed} reviewed, ${summary.flagged} flagged for the owner`)
  if (summary.stoppedReason) {
    console.log(`stopped early (${summary.stoppedReason}) — run again to continue where this left off`)
  }
} finally {
  await pool.end()
}
