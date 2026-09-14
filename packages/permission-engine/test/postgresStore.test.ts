import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgresApprovalStore } from '../src/approvals/postgresStore.js'
import { PostgresAuditLogStore } from '../src/audit/postgresStore.js'
import { createPermissionEngine } from '../src/engine.js'
import '../src/executors/noop.js'
import type { ActionRequest } from '../src/types.js'

const connectionString = process.env.TEST_DATABASE_URL

// Runs against a real Postgres database (see .env.example / README) —
// migrations must already be applied. Skips rather than fails when no
// TEST_DATABASE_URL is configured, so `npm test` stays green without a
// database available (e.g. before CI has one wired up).
describe.skipIf(!connectionString)('Postgres-backed stores', () => {
  const pool = new pg.Pool({ connectionString })
  let businessId: string
  let agentId: string
  let ownerId: string

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE approvals, audit_log, decisions, agents, owners, businesses RESTART IDENTITY CASCADE'
    )
    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (slug, name) VALUES ($1, 'Test Biz') RETURNING id`,
      [`test-${randomUUID()}`]
    )
    businessId = business.rows[0]!.id
    const agent = await pool.query<{ id: string }>(
      `INSERT INTO agents (business_id, key, role) VALUES ($1, 'test-agent', 'testing') RETURNING id`,
      [businessId]
    )
    agentId = agent.rows[0]!.id
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO owners (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`owner-${randomUUID()}@example.com`]
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
})
