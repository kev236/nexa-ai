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
    autonomyLevel: 1,
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

describe('autonomy level 2 auto-approve gate', () => {
  it('stays pending_approval at the default level 1, even with high confidence', async () => {
    const engine = engineWithAgent(baseAgent({ autonomyLevel: 1, config: { autoApproveMinConfidence: 0.5 } }))
    const outcome = await engine.requestAction(baseRequest({ confidence: 0.99 }))
    expect(outcome.status).toBe('pending_approval')
  })

  it('stays pending_approval at level 2 with no threshold configured', async () => {
    const engine = engineWithAgent(baseAgent({ autonomyLevel: 2, config: {} }))
    const outcome = await engine.requestAction(baseRequest({ confidence: 0.99 }))
    expect(outcome.status).toBe('pending_approval')
  })

  it('stays pending_approval at level 2 when the request carries no confidence', async () => {
    const engine = engineWithAgent(baseAgent({ autonomyLevel: 2, config: { autoApproveMinConfidence: 0.5 } }))
    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('pending_approval')
  })

  it('stays pending_approval when confidence is below the threshold', async () => {
    const engine = engineWithAgent(baseAgent({ autonomyLevel: 2, config: { autoApproveMinConfidence: 0.9 } }))
    const outcome = await engine.requestAction(baseRequest({ confidence: 0.8 }))
    expect(outcome.status).toBe('pending_approval')
  })

  it('stays pending_approval for an inactive agent, even if otherwise eligible', async () => {
    const engine = engineWithAgent(
      baseAgent({ autonomyLevel: 2, config: { autoApproveMinConfidence: 0.5 }, active: false })
    )
    const outcome = await engine.requestAction(baseRequest({ confidence: 0.99 }))
    expect(outcome.status).toBe('pending_approval')
  })

  it('stays pending_approval when the agent cannot be found at all', async () => {
    const engine = createPermissionEngine({ agentStore: new InMemoryAgentStore() })
    const outcome = await engine.requestAction(baseRequest({ confidence: 0.99 }))
    expect(outcome.status).toBe('pending_approval')
  })

  it('auto-executes at level 2 once confidence clears the configured threshold', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = engineWithAgent(baseAgent({ autonomyLevel: 2, config: { autoApproveMinConfidence: 0.9 } }))

    const outcome = await engine.requestAction(
      baseRequest({ actionType: 'send_email', confidence: 0.95, payload: { to: 'a@b.com' } })
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

  it('records the approval as approved with no resolvedBy — distinguishing it from a human decision', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = engineWithAgent(baseAgent({ autonomyLevel: 2, config: { autoApproveMinConfidence: 0.9 } }))

    const outcome = await engine.requestAction(
      baseRequest({ actionType: 'send_email', confidence: 0.95, payload: { to: 'a@b.com' } })
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
    const agentStore = new InMemoryAgentStore(
      new Map([[AGENT_ID, baseAgent({ autonomyLevel: 2, config: { autoApproveMinConfidence: 0.9 } })]])
    )
    const engine = createPermissionEngine({ agentStore, notifier })

    await engine.requestAction(baseRequest({ actionType: 'send_email', confidence: 0.95, payload: { to: 'a@b.com' } }))
    expect(calls).toHaveLength(0)
  })

  it('still notifies when the same agent falls back to pending (confidence too low)', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const calls: unknown[] = []
    const notifier: Notifier = {
      async notifyPendingApproval(request, approvalId) {
        calls.push({ request, approvalId })
      },
    }
    const agentStore = new InMemoryAgentStore(
      new Map([[AGENT_ID, baseAgent({ autonomyLevel: 2, config: { autoApproveMinConfidence: 0.9 } })]])
    )
    const engine = createPermissionEngine({ agentStore, notifier })

    const outcome = await engine.requestAction(
      baseRequest({ actionType: 'send_email', confidence: 0.5, payload: { to: 'a@b.com' } })
    )
    expect(outcome.status).toBe('pending_approval')
    expect(calls).toHaveLength(1)
  })

  it('fails closed to pending_approval when the autonomy check itself throws', async () => {
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

    const outcome = await engine.requestAction(baseRequest({ confidence: 0.99 }))
    expect(outcome.status).toBe('pending_approval')
  })
})
