#!/usr/bin/env node
// Step 5 + 6: runs the waitlist-triage agent over events that don't have a
// decision yet, drafts a reply for each via Claude, and submits it through
// requestAction() as actionType 'send_email' — approving it now sends an
// actual email via Resend (step 6), not just records a draft. Needs the
// package built first (npm run build:permission-engine), DATABASE_URL,
// ANTHROPIC_API_KEY, RESEND_API_KEY, and the business's config.emailFrom
// set (db/setBusinessConfig.mjs).
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
  registerSendEmailExecutor,
  triageEvent,
} from '../dist/index.js'

registerSendEmailExecutor()

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

    const to = typeof event.payload?.email === 'string' ? event.payload.email : undefined
    if (!to) {
      console.log(`skipping event ${event.id} (${event.type}) — no email address in payload`)
      skipped++
      continue
    }

    const result = await triageEvent(llmClient, event)
    const subject =
      event.type === 'waitlist_signup' ? "You're on the Nexa Labs waitlist" : 'Re: your message to Nexa Labs'

    await engine.decisionStore.record({
      businessId,
      agentId,
      eventId: event.id,
      actionType: 'send_email',
      reasoning: result.reasoning,
      expectedResult: { to, subject, body: result.draftReply },
      confidence: result.confidence,
    })

    const outcome = await engine.requestAction({
      businessId,
      agentId,
      actionType: 'send_email',
      payload: { to, subject, body: result.draftReply },
      reasoning: result.reasoning,
      expectedResult: { to, subject, body: result.draftReply },
    })

    console.log(`triaged event ${event.id} (${event.type}) -> ${outcome.status}`)
    triaged++
  }

  console.log(`done: ${triaged} triaged, ${skipped} already had a decision`)
} finally {
  await pool.end()
}
