import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import { InMemoryAgentStore } from '../src/agents/memoryStore.js'
import type { AgentRecord } from '../src/agents/store.js'
import { registerExecutor } from '../src/executors/registry.js'
import type { ActionRequest } from '../src/types.js'
import type { Notifier } from '../src/notifications/notifier.js'
import '../src/executors/noop.js'

const AGENT_ID = 'agent_1'

function baseRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    businessId: 'biz_1',
    agentId: AGENT_ID,
    actionType: 'noop',
    payload: { x: 1 },
    reasoning: 'test exercise',
    expectedResult: { x: 1 },
    ...overrides,
  }
}

function baseAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: AGENT_ID,
    businessId: 'biz_1',
    key: 'waitlist-triage',
    role: 'testing',
    config: {},
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function engineWithAgent(agent: AgentRecord) {
  const agentStore = new InMemoryAgentStore(new Map([[agent.id, agent]]))
  return createPermissionEngine({ agentStore })
}

describe('ActionRequest.confidence validation', () => {
  it('rejects a confidence outside 0-1', async () => {
    const engine = createPermissionEngine()
    await expect(engine.requestAction(baseRequest({ confidence: 1.5 }))).rejects.toThrow(/confidence/)
    await expect(engine.requestAction(baseRequest({ confidence: -0.1 }))).rejects.toThrow(/confidence/)
  })

  it('accepts a confidence within 0-1, or omitted entirely', async () => {
    const engine = createPermissionEngine()
    await expect(engine.requestAction(baseRequest({ confidence: 0.5 }))).resolves.toBeDefined()
    await expect(engine.requestAction(baseRequest())).resolves.toBeDefined()
  })
})

/**
 * Step 18: approval policy simplified. Auto-approve is now the default
 * for any active agent's request — money (`expectedCost`) is the one
 * thing that still stops and waits. Replaces step 11's opt-in
 * autonomy-level-2 + confidence-threshold system.
 */
describe('auto-approve everything except money (step 18)', () => {
  it('auto-executes a non-money action for an active agent, regardless of confidence', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = engineWithAgent(baseAgent())

    const outcome = await engine.requestAction(
      baseRequest({ actionType: 'send_email', payload: { to: 'a@b.com' } })
    )

    expect(outcome.status).toBe('executed')
    if (outcome.status !== 'executed') return
    expect(outcome.result).toEqual({ to: 'a@b.com' })

    // Reused resolveApproval's own execute path — same audit trail shape
    // a human approval produces, just with no pending_approval wait.
    const auditRecord = await engine.auditStore.get(outcome.auditId)
    expect(auditRecord?.status).toBe('executed')

    const approvals = await engine.approvalStore.listPending()
    expect(approvals).toHaveLength(0) // nothing left waiting
  })

  it('auto-executes even with no confidence on the request at all', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = engineWithAgent(baseAgent())
    const outcome = await engine.requestAction(baseRequest({ actionType: 'send_email', payload: { to: 'a@b.com' } }))
    expect(outcome.status).toBe('executed')
  })

  it('stays pending_approval for a money-spending action, no matter how small', async () => {
    const engine = engineWithAgent(baseAgent())
    const outcome = await engine.requestAction(
      baseRequest({ expectedCost: { amountCents: 1, currency: 'USD' } })
    )
    expect(outcome.status).toBe('pending_approval')
  })

  it('stays pending_approval for an inactive agent, even for a non-money action', async () => {
    const engine = engineWithAgent(baseAgent({ active: false }))
    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('pending_approval')
  })

  it('stays pending_approval when the agent cannot be found at all', async () => {
    const engine = createPermissionEngine({ agentStore: new InMemoryAgentStore() })
    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('pending_approval')
  })

  it('records the approval as approved with no resolvedBy — distinguishing it from a human decision', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = engineWithAgent(baseAgent())

    const outcome = await engine.requestAction(
      baseRequest({ actionType: 'send_email', payload: { to: 'a@b.com' } })
    )
    if (outcome.status !== 'executed') throw new Error('expected executed')

    const [approval] = await engine.approvalStore.listByBusiness('biz_1')
    expect(approval?.status).toBe('approved')
    expect(approval?.resolvedBy).toBeUndefined()
    expect(approval?.resolvedAt).toBeDefined()
  })

  it('never notifies the owner for something already auto-approved', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const calls: unknown[] = []
    const notifier: Notifier = {
      async notifyPendingApproval(request, approvalId) {
        calls.push({ request, approvalId })
      },
    }
    const agentStore = new InMemoryAgentStore(new Map([[AGENT_ID, baseAgent()]]))
    const engine = createPermissionEngine({ agentStore, notifier })

    await engine.requestAction(baseRequest({ actionType: 'send_email', payload: { to: 'a@b.com' } }))
    expect(calls).toHaveLength(0)
  })

  it('still notifies when a money-spending request falls back to pending', async () => {
    const calls: unknown[] = []
    const notifier: Notifier = {
      async notifyPendingApproval(request, approvalId) {
        calls.push({ request, approvalId })
      },
    }
    const agentStore = new InMemoryAgentStore(new Map([[AGENT_ID, baseAgent()]]))
    const engine = createPermissionEngine({ agentStore, notifier })

    const outcome = await engine.requestAction(
      baseRequest({ expectedCost: { amountCents: 1, currency: 'USD' } })
    )
    expect(outcome.status).toBe('pending_approval')
    expect(calls).toHaveLength(1)
  })

  it('fails closed to pending_approval when the auto-approve check itself throws', async () => {
    const agentStore = {
      async getByKey() {
        return undefined
      },
      async getById(): Promise<AgentRecord | undefined> {
        throw new Error('database is down')
      },
      async listByBusiness() {
        return []
      },
    }
    const engine = createPermissionEngine({ agentStore })

    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('pending_approval')
  })
})
