import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import type { ActionRequest } from '../src/types.js'
import '../src/executors/noop.js'

// Negative/large olderThanMs values sidestep real-clock flakiness (a
// record created and checked within the same millisecond) — see the
// individual tests for which direction each needs.
const DEFINITELY_STALE_MS = -1000 // cutoff is 1s in the future: anything already recorded counts as stale
const DEFINITELY_FRESH_MS = 60 * 60 * 1000 // 1 hour: nothing recorded moments ago counts as stale

function baseRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    businessId: 'biz_1',
    agentId: 'agent_1',
    actionType: 'noop',
    payload: {},
    reasoning: 'test exercise',
    expectedResult: {},
    ...overrides,
  }
}

describe('reapAbandonedRequests — step 12 crash recovery', () => {
  it('reports zero when there is nothing stale', async () => {
    const engine = createPermissionEngine()
    await expect(engine.reapAbandonedRequests(DEFINITELY_STALE_MS)).resolves.toEqual({ abandoned: 0 })
  })

  it('leaves a request with a real pending approval alone — that is unreviewed, not abandoned', async () => {
    const engine = createPermissionEngine()
    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('pending_approval')

    await expect(engine.reapAbandonedRequests(DEFINITELY_STALE_MS)).resolves.toEqual({ abandoned: 0 })

    const record = await engine.auditStore.get(outcome.auditId)
    expect(record?.status).toBe('requested')
  })

  it('leaves a fresh orphaned request alone — the staleness threshold has not elapsed', async () => {
    // Simulate the exact crash window directly: an audit row with no
    // matching approval, exactly what a process killed between
    // recordRequested() and createPending() would leave behind.
    const engine = createPermissionEngine()
    const auditId = await engine.auditStore.recordRequested(baseRequest())

    await expect(engine.reapAbandonedRequests(DEFINITELY_FRESH_MS)).resolves.toEqual({ abandoned: 0 })
    const record = await engine.auditStore.get(auditId)
    expect(record?.status).toBe('requested')
  })

  it('marks an orphaned, stale request abandoned — the crash-recovery path', async () => {
    const engine = createPermissionEngine()
    const auditId = await engine.auditStore.recordRequested(baseRequest())

    await expect(engine.reapAbandonedRequests(DEFINITELY_STALE_MS)).resolves.toEqual({ abandoned: 1 })

    const record = await engine.auditStore.get(auditId)
    expect(record?.status).toBe('abandoned')
    expect(record?.abandonedReason).toMatch(/crashed/)
    expect(record?.resolvedAt).toBeDefined()
  })

  it('never touches an already-resolved request', async () => {
    const engine = createPermissionEngine()
    const auditId = await engine.auditStore.recordRequested(baseRequest())
    await engine.auditStore.recordDenied(auditId, 'test denial')

    await expect(engine.reapAbandonedRequests(DEFINITELY_STALE_MS)).resolves.toEqual({ abandoned: 0 })
    const record = await engine.auditStore.get(auditId)
    expect(record?.status).toBe('denied')
  })

  it('respects the limit parameter', async () => {
    const engine = createPermissionEngine()
    const id1 = await engine.auditStore.recordRequested(baseRequest())
    const id2 = await engine.auditStore.recordRequested(baseRequest())

    await expect(engine.reapAbandonedRequests(DEFINITELY_STALE_MS, 1)).resolves.toEqual({ abandoned: 1 })

    const statuses = (
      await Promise.all([engine.auditStore.get(id1), engine.auditStore.get(id2)])
    ).map((r) => r?.status).sort()
    expect(statuses).toEqual(['abandoned', 'requested'])
  })
})
