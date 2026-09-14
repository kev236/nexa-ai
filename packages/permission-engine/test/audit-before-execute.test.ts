import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import type { ActionRequest } from '../src/types.js'
import '../src/executors/noop.js'

function baseRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    businessId: 'biz_1',
    agentId: 'agent_1',
    actionType: 'noop',
    payload: { charge: 1000 },
    reasoning: 'test exercise',
    expectedResult: { charge: 1000 },
    ...overrides,
  }
}

describe('audit before execute (invariant #2)', () => {
  it('writes a requested audit record before any approval or execution exists', async () => {
    const engine = createPermissionEngine()
    const outcome = await engine.requestAction(baseRequest())

    const record = await engine.auditStore.get(outcome.auditId)
    expect(record).toBeDefined()
    expect(record?.status).toBe('requested')
    expect(record?.actualResult).toBeUndefined()
    expect(record?.reasoning).toBe('test exercise')
    // The audit record exists with the full request context even though
    // nothing has executed yet — that's the point of the invariant.
    expect(record?.payload).toEqual({ charge: 1000 })
  })

  it('records the outcome after execution, without rewriting the original request fields', async () => {
    const engine = createPermissionEngine()
    const outcome = await engine.requestAction(baseRequest())
    if (outcome.status !== 'pending_approval') throw new Error('expected pending_approval')

    await engine.resolveApproval(outcome.approvalId, 'approved', 'owner_kevin')

    const record = await engine.auditStore.get(outcome.auditId)
    expect(record?.status).toBe('executed')
    expect(record?.actualResult).toEqual({ charge: 1000 })
    expect(record?.resolvedAt).toBeDefined()
    // Original request fields are untouched by resolution.
    expect(record?.payload).toEqual({ charge: 1000 })
    expect(record?.requestedAt).toBeDefined()
  })

  it('records a denial with its reason, distinct from an unregistered-executor denial', async () => {
    const engine = createPermissionEngine()

    const unregistered = await engine.requestAction(baseRequest({ actionType: 'wire_transfer' }))
    const unregisteredRecord = await engine.auditStore.get(unregistered.auditId)
    expect(unregisteredRecord?.status).toBe('denied')
    expect(unregisteredRecord?.deniedReason).toMatch(/no executor registered/)

    const toDeny = await engine.requestAction(baseRequest())
    if (toDeny.status !== 'pending_approval') throw new Error('expected pending_approval')
    await engine.resolveApproval(toDeny.approvalId, 'denied', 'owner_kevin')
    const deniedRecord = await engine.auditStore.get(toDeny.auditId)
    expect(deniedRecord?.status).toBe('denied')
    expect(deniedRecord?.deniedReason).toMatch(/denied by owner_kevin/)
  })
})
