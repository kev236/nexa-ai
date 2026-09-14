#!/usr/bin/env node
// Step 5: runs the waitlist-triage agent over events that don't have a
// decision yet, drafts a reply for each via Claude, and submits it through
// requestAction() for owner approval (actionType 'noop' — approving it
// records the draft as 'executed' but sends nothing; there is no real
// send-email action yet, that's step 6). Needs the package built first
// (npm run build:permission-engine), DATABASE_URL, and ANTHROPIC_API_KEY.
//
// Usage: node db/runWaitlistTriage.mjs <business-slug> <agent-key>
import pg from 'pg'
import {
  createAnthropicClient,
  createPermissionEngine,
  createPostgresApprovalStore,
  createPostgresAuditLogStore,
  createPostgresDecisionStore,
  createPostgresEventStore,
  triageEvent,
} from '../dist/index.js'

const [, , businessSlug = 'nexa-labs', agentKey = 'waitlist-triage'] = process.argv

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

  const engine = createPermissionEngine({
    auditStore: createPostgresAuditLogStore(),
    approvalStore: createPostgresApprovalStore(),
    eventStore: createPostgresEventStore(),
    decisionStore: createPostgresDecisionStore(),
  })
  const llmClient = createAnthropicClient()

  const events = await engine.eventStore.listByBusiness(businessId, 500)
  let triaged = 0
  let skipped = 0

  for (const event of events) {
    if (await engine.decisionStore.hasDecisionForEvent(event.id)) {
      skipped++
      continue
    }

    const result = await triageEvent(llmClient, event)

    await engine.decisionStore.record({
      businessId,
      agentId,
      eventId: event.id,
      actionType: 'noop',
      reasoning: result.reasoning,
      expectedResult: { draftReply: result.draftReply },
      confidence: result.confidence,
    })

    const outcome = await engine.requestAction({
      businessId,
      agentId,
      actionType: 'noop',
      payload: { eventId: event.id, eventType: event.type, draftReply: result.draftReply },
      reasoning: result.reasoning,
      expectedResult: { draftReply: result.draftReply },
    })

    console.log(`triaged event ${event.id} (${event.type}) -> ${outcome.status}`)
    triaged++
  }

  console.log(`done: ${triaged} triaged, ${skipped} already had a decision`)
} finally {
  await pool.end()
}
