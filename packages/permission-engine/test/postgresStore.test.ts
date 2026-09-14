import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgresApprovalStore } from '../src/approvals/postgresStore.js'
import { PostgresAuditLogStore } from '../src/audit/postgresStore.js'
import { PostgresOwnerStore } from '../src/owners/postgresStore.js'
import { PostgresEventStore } from '../src/events/postgresStore.js'
import { PostgresDecisionStore } from '../src/decisions/postgresStore.js'
import { PostgresBusinessStore } from '../src/businesses/postgresStore.js'
import { PostgresTransactionStore } from '../src/transactions/postgresStore.js'
import { PostgresAgentStore } from '../src/agents/postgresStore.js'
import { createPermissionEngine } from '../src/engine.js'
import { hashPassword } from '../src/password.js'
import { createSendEmailExecutor, type ResendClient } from '../src/executors/sendEmail.js'
import { createEmailNotifier } from '../src/notifications/emailNotifier.js'
import { registerExecutor } from '../src/executors/registry.js'
import '../src/executors/noop.js'
import type { ActionRequest } from '../src/types.js'
import type { BusinessAdapter, ObservedEvent, ObservedTransaction } from '../src/adapters/types.js'

const connectionString = process.env.TEST_DATABASE_URL

// Runs against a real Postgres database (see .env.example / README) —
// migrations must already be applied. Skips rather than fails when no
// TEST_DATABASE_URL is configured, so `npm test` stays green without a
// database available (e.g. before CI has one wired up).
describe.skipIf(!connectionString)('Postgres-backed stores', () => {
  const pool = new pg.Pool({ connectionString })
  let businessId: string
  let businessSlug: string
  let agentId: string
  let ownerId: string
  let ownerEmail: string
  const ownerPassword = 'correct-horse-battery-staple'

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE transactions, events, approvals, audit_log, decisions, agents, owners, businesses RESTART IDENTITY CASCADE'
    )
    businessSlug = `test-${randomUUID()}`
    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (slug, name) VALUES ($1, 'Test Biz') RETURNING id`,
      [businessSlug]
    )
    businessId = business.rows[0]!.id
    const agent = await pool.query<{ id: string }>(
      `INSERT INTO agents (business_id, key, role) VALUES ($1, 'test-agent', 'testing') RETURNING id`,
      [businessId]
    )
    agentId = agent.rows[0]!.id
    ownerEmail = `owner-${randomUUID()}@example.com`
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO owners (email, password_hash) VALUES ($1, $2) RETURNING id`,
      [ownerEmail, hashPassword(ownerPassword)]
    )
    ownerId = owner.rows[0]!.id
  })

  afterAll(async () => {
    await pool.end()
  })

  function baseRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
    return {
      businessId,
      agentId,
      actionType: 'noop',
      payload: { via: 'postgres' },
      reasoning: 'postgres store exercise',
      expectedResult: { via: 'postgres' },
      ...overrides,
    }
  }

  it('runs requestAction -> resolveApproval end to end against real Postgres', async () => {
    const engine = createPermissionEngine({
      auditStore: new PostgresAuditLogStore(pool),
      approvalStore: new PostgresApprovalStore(pool),
    })

    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('pending_approval')
    if (outcome.status !== 'pending_approval') return

    const requestedRecord = await engine.auditStore.get(outcome.auditId)
    expect(requestedRecord?.status).toBe('requested')
    expect(requestedRecord?.businessId).toBe(businessId)

    const resolved = await engine.resolveApproval(outcome.approvalId, 'approved', ownerId)
    expect(resolved.status).toBe('executed')

    const executedRecord = await engine.auditStore.get(outcome.auditId)
    expect(executedRecord?.status).toBe('executed')
    expect(executedRecord?.actualResult).toEqual({ via: 'postgres' })
  })

  it('enforces the business_id foreign key at the database layer', async () => {
    const store = new PostgresAuditLogStore(pool)
    await expect(store.recordRequested(baseRequest({ businessId: randomUUID() }))).rejects.toThrow()
  })

  it('persists denial reason and resolvedBy through resolveApproval', async () => {
    const engine = createPermissionEngine({
      auditStore: new PostgresAuditLogStore(pool),
      approvalStore: new PostgresApprovalStore(pool),
    })
    const outcome = await engine.requestAction(baseRequest())
    if (outcome.status !== 'pending_approval') throw new Error('expected pending_approval')

    await engine.resolveApproval(outcome.approvalId, 'denied', ownerId)

    const approval = await engine.approvalStore.get(outcome.approvalId)
    expect(approval?.status).toBe('denied')
    expect(approval?.resolvedBy).toBe(ownerId)

    const auditRecord = await engine.auditStore.get(outcome.auditId)
    expect(auditRecord?.status).toBe('denied')
    expect(auditRecord?.deniedReason).toMatch(new RegExp(`denied by ${ownerId}`))
  })

  it('verifies owner login credentials against a real hashed password', async () => {
    const engine = createPermissionEngine({ ownerStore: new PostgresOwnerStore(pool) })

    const success = await engine.verifyOwnerCredentials(ownerEmail, ownerPassword)
    expect(success).toEqual({ ownerId })

    const failure = await engine.verifyOwnerCredentials(ownerEmail, 'wrong password')
    expect(failure).toBeNull()
  })

  it('lists every owner against real Postgres (step 10)', async () => {
    const store = new PostgresOwnerStore(pool)
    const owners = await store.listAll()
    expect(owners.map((o) => o.id)).toContain(ownerId)
    expect(owners.map((o) => o.email)).toContain(ownerEmail)
  })

  it('lists pending approvals from real Postgres, oldest first', async () => {
    const engine = createPermissionEngine({
      auditStore: new PostgresAuditLogStore(pool),
      approvalStore: new PostgresApprovalStore(pool),
    })

    const first = await engine.requestAction(baseRequest({ payload: { order: 1 } }))
    const second = await engine.requestAction(baseRequest({ payload: { order: 2 } }))
    if (first.status !== 'pending_approval' || second.status !== 'pending_approval') {
      throw new Error('expected pending_approval')
    }
    await engine.resolveApproval(first.approvalId, 'approved', ownerId)

    const pending = await engine.listPendingApprovals()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(second.approvalId)
    expect(pending[0]?.request.payload).toEqual({ order: 2 })
  })

  it('ingests events idempotently against real Postgres, scoped per business', async () => {
    const engine = createPermissionEngine({ eventStore: new PostgresEventStore(pool) })
    const events: ObservedEvent[] = [
      { source: 'fake', type: 'signup', payload: { n: 1 }, occurredAt: '2026-01-01T00:00:00Z', externalId: 'ext-1' },
    ]
    const adapter: BusinessAdapter = {
      adapterType: 'fake',
      async backfill() {
        return events
      },
      async observe() {
        return []
      },
      listActions() {
        return []
      },
      async execute() {
        throw new Error('not implemented')
      },
      async healthCheck() {
        return { ok: true }
      },
    }

    const first = await engine.ingestEvents(adapter, businessId, 'backfill')
    expect(first).toEqual({ observed: 1, inserted: 1, skipped: 0 })

    // Re-running backfill is a no-op against the unique (business_id, source, external_id) index.
    const second = await engine.ingestEvents(adapter, businessId, 'backfill')
    expect(second).toEqual({ observed: 1, inserted: 0, skipped: 1 })

    const stored = await engine.eventStore.listByBusiness(businessId)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.payload).toEqual({ n: 1 })

    // The same external_id under a different business is not a duplicate.
    const otherBusiness = await pool.query<{ id: string }>(
      `INSERT INTO businesses (slug, name) VALUES ($1, 'Other Biz') RETURNING id`,
      [`other-${randomUUID()}`]
    )
    const forOther = await engine.ingestEvents(adapter, otherBusiness.rows[0]!.id, 'backfill')
    expect(forOther).toEqual({ observed: 1, inserted: 1, skipped: 0 })
  })

  it('records decisions linked to events, and reports idempotency correctly', async () => {
    const eventStore = new PostgresEventStore(pool)
    const decisionStore = new PostgresDecisionStore(pool)
    const engine = createPermissionEngine({ eventStore })

    const adapter: BusinessAdapter = {
      adapterType: 'fake',
      async backfill() {
        return [
          { source: 'fake', type: 'waitlist_signup', payload: { email: 'a@b.com' }, occurredAt: '2026-01-01T00:00:00Z', externalId: 'ev-1' },
        ]
      },
      async observe() {
        return []
      },
      listActions() {
        return []
      },
      async execute() {
        throw new Error('not implemented')
      },
      async healthCheck() {
        return { ok: true }
      },
    }
    await engine.ingestEvents(adapter, businessId, 'backfill')
    const [event] = await eventStore.listByBusiness(businessId)
    if (!event) throw new Error('expected one event')

    expect(await decisionStore.hasDecisionForEvent(event.id)).toBe(false)

    const decisionId = await decisionStore.record({
      businessId,
      agentId,
      eventId: event.id,
      actionType: 'noop',
      reasoning: 'test reasoning',
      expectedResult: { draftReply: 'hi' },
      confidence: 0.8,
    })

    expect(await decisionStore.hasDecisionForEvent(event.id)).toBe(true)

    const decisions = await decisionStore.listByBusiness(businessId)
    expect(decisions).toHaveLength(1)
    expect(decisions[0]).toMatchObject({
      id: decisionId,
      eventId: event.id,
      agentId,
      reasoning: 'test reasoning',
      confidence: 0.8,
    })
  })

  it('reads a business config written directly to the businesses table', async () => {
    await pool.query(`UPDATE businesses SET config = $2::jsonb WHERE id = $1`, [
      businessId,
      JSON.stringify({ emailFrom: 'Test Biz <hello@test.example>' }),
    ])
    const store = new PostgresBusinessStore(pool)
    expect(await store.getConfig(businessId)).toEqual({ emailFrom: 'Test Biz <hello@test.example>' })
  })

  it('defaults to an empty object for a business with no config set', async () => {
    const store = new PostgresBusinessStore(pool)
    expect(await store.getConfig(businessId)).toEqual({})
  })

  it('runs send_email through requestAction -> resolveApproval, reading emailFrom from real Postgres', async () => {
    await pool.query(`UPDATE businesses SET config = $2::jsonb WHERE id = $1`, [
      businessId,
      JSON.stringify({ emailFrom: 'Test Biz <hello@test.example>' }),
    ])

    let sentPayload: unknown
    const fakeResend: ResendClient = {
      emails: {
        send: async (payload) => {
          sentPayload = payload
          return { data: { id: 'email_abc' }, error: null }
        },
      },
    }
    registerExecutor('send_email', createSendEmailExecutor(fakeResend, new PostgresBusinessStore(pool)))

    const engine = createPermissionEngine({
      auditStore: new PostgresAuditLogStore(pool),
      approvalStore: new PostgresApprovalStore(pool),
    })

    const outcome = await engine.requestAction(
      baseRequest({
        actionType: 'send_email',
        payload: { to: 'lead@example.com', subject: 'Hi', body: 'Thanks!' },
      })
    )
    if (outcome.status !== 'pending_approval') throw new Error('expected pending_approval')

    const resolved = await engine.resolveApproval(outcome.approvalId, 'approved', ownerId)
    expect(resolved.status).toBe('executed')
    expect(sentPayload).toEqual({
      from: 'Test Biz <hello@test.example>',
      to: 'lead@example.com',
      subject: 'Hi',
      text: 'Thanks!',
    })
  })

  it('ingests transactions idempotently against real Postgres, scoped per business', async () => {
    const engine = createPermissionEngine({ transactionStore: new PostgresTransactionStore(pool) })
    const transactions: ObservedTransaction[] = [
      { type: 'charge', amountCents: 5000, currency: 'eur', externalRef: 'ch_1', status: 'succeeded', occurredAt: '2026-01-01T00:00:00Z' },
    ]
    const adapter: BusinessAdapter = {
      adapterType: 'fake',
      async backfill() {
        return []
      },
      async observe() {
        return []
      },
      async listTransactions() {
        return transactions
      },
      listActions() {
        return []
      },
      async execute() {
        throw new Error('not implemented')
      },
      async healthCheck() {
        return { ok: true }
      },
    }

    const first = await engine.ingestTransactions(adapter, businessId)
    expect(first).toEqual({ observed: 1, inserted: 1, skipped: 0 })

    const second = await engine.ingestTransactions(adapter, businessId)
    expect(second).toEqual({ observed: 1, inserted: 0, skipped: 1 })

    const stored = await engine.transactionStore.listByBusiness(businessId)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ type: 'charge', amountCents: 5000, currency: 'eur', externalRef: 'ch_1' })
  })

  it('resolves a business by slug against real Postgres (step 8)', async () => {
    const store = new PostgresBusinessStore(pool)
    expect(await store.getBySlug(businessSlug)).toEqual({
      id: businessId,
      slug: businessSlug,
      name: 'Test Biz',
      status: 'active',
    })
    expect(await store.getBySlug('no-such-slug')).toBeUndefined()
  })

  it('lists an activity feed from real Postgres, most recent first (step 8)', async () => {
    const engine = createPermissionEngine({ auditStore: new PostgresAuditLogStore(pool) })
    await engine.requestAction(baseRequest({ payload: { order: 1 } }))
    await engine.requestAction(baseRequest({ payload: { order: 2 } }))

    const feed = await engine.auditStore.listByBusiness(businessId)
    expect(feed).toHaveLength(2)
    expect(feed[0]?.payload).toEqual({ order: 2 })
    expect(feed[1]?.payload).toEqual({ order: 1 })
  })

  it('reads an agent by key and lists agents for a business against real Postgres (step 8)', async () => {
    const store = new PostgresAgentStore(pool)
    const agent = await store.getByKey(businessId, 'test-agent')
    expect(agent).toMatchObject({ id: agentId, businessId, key: 'test-agent', role: 'testing', autonomyLevel: 1, active: true })
    expect(await store.getByKey(businessId, 'no-such-key')).toBeUndefined()

    const list = await store.listByBusiness(businessId)
    expect(list).toEqual([agent])
  })

  it('notifies the real owner on requestAction, reading emailFrom from real Postgres (step 10)', async () => {
    await pool.query(`UPDATE businesses SET config = $2::jsonb WHERE id = $1`, [
      businessId,
      JSON.stringify({ emailFrom: 'Nexa AI <ops@test.example>' }),
    ])

    let sentTo: string | undefined
    const resend: ResendClient = {
      emails: {
        send: async (payload) => {
          sentTo = payload.to
          return { data: { id: 'email_1' }, error: null }
        },
      },
    }
    const notifier = createEmailNotifier(resend, new PostgresOwnerStore(pool), new PostgresBusinessStore(pool))
    const engine = createPermissionEngine({ notifier })

    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('pending_approval')
    expect(sentTo).toBe(ownerEmail)
  })
})
