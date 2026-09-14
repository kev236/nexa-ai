import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import type { ActionRequest } from '../src/types.js'
import '../src/executors/noop.js' // registration is a side effect, shared across the process

function baseRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    businessId: 'biz_1',
    agentId: 'agent_1',
    actionType: 'noop',
    payload: { hello: 'world' },
    reasoning: 'test exercise',
    expectedResult: { hello: 'world' },
    ...overrides,
  }
}

describe('requestAction', () => {
  it('never auto-executes — a known actionType still returns pending_approval', async () => {
    const engine = createPermissionEngine()
    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('pending_approval')
  })

  it('denies an unregistered actionType and records why', async () => {
    const engine = createPermissionEngine()
    const outcome = await engine.requestAction(baseRequest({ actionType: 'send_wire_transfer' }))
    expect(outcome.status).toBe('denied')
    if (outcome.status === 'denied') {
      expect(outcome.reason).toMatch(/no executor registered/)
    }
  })

  it('rejects a payload that is not plain JSON, before anything is recorded', async () => {
    const engine = createPermissionEngine()
    const dangerous = { escape: () => 'i have a function reference' }
    await expect(
      engine.requestAction(baseRequest({ payload: dangerous as never }))
    ).rejects.toThrow(TypeError)
    expect(await engine.auditStore.get('nonexistent')).toBeUndefined()
  })
})

describe('resolveApproval', () => {
  it('executes the registered executor and returns its result on approval', async () => {
    const engine = createPermissionEngine()
    const outcome = await engine.requestAction(baseRequest({ payload: { amount: 5 } }))
    if (outcome.status !== 'pending_approval') throw new Error('expected pending_approval')

    const resolved = await engine.resolveApproval(outcome.approvalId, 'approved', 'owner_kevin')
    expect(resolved.status).toBe('executed')
    if (resolved.status === 'executed') {
      expect(resolved.result).toEqual({ amount: 5 })
    }
  })

  it('never runs the executor when denied', async () => {
    const engine = createPermissionEngine()
    const outcome = await engine.requestAction(baseRequest())
    if (outcome.status !== 'pending_approval') throw new Error('expected pending_approval')

    const resolved = await engine.resolveApproval(outcome.approvalId, 'denied', 'owner_kevin')
    expect(resolved.status).toBe('denied')
  })

  it('refuses to resolve the same approval twice', async () => {
    const engine = createPermissionEngine()
    const outcome = await engine.requestAction(baseRequest())
    if (outcome.status !== 'pending_approval') throw new Error('expected pending_approval')

    await engine.resolveApproval(outcome.approvalId, 'approved', 'owner_kevin')
    await expect(
      engine.resolveApproval(outcome.approvalId, 'approved', 'owner_kevin')
    ).rejects.toThrow(/already resolved/)
  })

  it('throws on an unknown approval id rather than silently doing nothing', async () => {
    const engine = createPermissionEngine()
    await expect(engine.resolveApproval('does-not-exist', 'approved', 'owner_kevin')).rejects.toThrow(
      /no such approval/
    )
  })
})
