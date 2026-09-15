import { describe, expect, it } from 'vitest'
import { discoverOpportunities } from '../src/agents/opportunityDiscoveryAgent.js'
import { runOpportunityDiscoveryOnce } from '../src/agents/runOpportunityDiscovery.js'
import { createProposeOpportunityExecutor } from '../src/executors/proposeOpportunity.js'
import { InMemoryOpportunityStore } from '../src/opportunities/memoryStore.js'
import { InMemoryAgentStore } from '../src/agents/memoryStore.js'
import { registerExecutor } from '../src/executors/registry.js'
import { createPermissionEngine } from '../src/engine.js'
import { SCORE_DIMENSIONS } from '../src/opportunities/scoring.js'
import type { OpportunityScores } from '../src/opportunities/scoring.js'
import type { AgentRecord } from '../src/agents/store.js'
import type { MessagesClient } from '../src/llm/client.js'

function fakeToolClient(toolName: string, input: unknown): MessagesClient {
  return {
    messages: {
      async create() {
        return {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5',
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: 'tool_use', id: 'toolu_1', name: toolName, input }],
        } as never
      },
    },
  }
}

function scores(value = 60): OpportunityScores {
  const s: Record<string, number> = {}
  for (const { key } of SCORE_DIMENSIONS) s[key] = value
  return s as unknown as OpportunityScores
}

function oneOpportunity(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Nexa InvoiceFlow',
    problem: 'Freelancers waste hours chasing overdue invoices',
    targetCustomer: 'Solo freelancers and small agencies',
    recommendation: 'RESEARCH FURTHER',
    scores: scores(),
    ...overrides,
  }
}

describe('discoverOpportunities — Opportunity Discovery Agent', () => {
  it('returns proposals with a server-computed totalScore, never trusting model arithmetic', async () => {
    const client = fakeToolClient('record_opportunity_proposals', {
      opportunities: [oneOpportunity()],
      reasoning: 'Freelance invoicing is a well-documented pain point.',
      confidence: 0.7,
    })
    const result = await discoverOpportunities(client, [])
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0]).toMatchObject({ name: 'Nexa InvoiceFlow', totalScore: 60 })
    expect(result.reasoning).toMatch(/freelance invoicing/i)
    expect(result.confidence).toBe(0.7)
  })

  it('throws on a missing/empty opportunities array — likely a truncated response', async () => {
    const client = fakeToolClient('record_opportunity_proposals', {
      opportunities: [],
      reasoning: 'nothing grounded enough',
      confidence: 0.2,
    })
    await expect(discoverOpportunities(client, [])).rejects.toThrow(/opportunities/)
  })

  it('throws when a proposal is missing a required text field', async () => {
    const client = fakeToolClient('record_opportunity_proposals', {
      opportunities: [oneOpportunity({ targetCustomer: undefined })],
      reasoning: 'test',
      confidence: 0.5,
    })
    await expect(discoverOpportunities(client, [])).rejects.toThrow(/required text field/)
  })

  it('throws when a proposal has an out-of-range score, same validation the owner\'s own form uses', async () => {
    const client = fakeToolClient('record_opportunity_proposals', {
      opportunities: [oneOpportunity({ scores: scores(150) })],
      reasoning: 'test',
      confidence: 0.5,
    })
    await expect(discoverOpportunities(client, [])).rejects.toThrow(/between 0 and 100/)
  })
})

describe('propose_opportunity executor', () => {
  it('writes the opportunity and tags it with the calling agent', async () => {
    const store = new InMemoryOpportunityStore()
    const executor = createProposeOpportunityExecutor(store)
    const result = await executor(oneOpportunity(), { businessId: 'biz_1', agentId: 'agent_1' })
    expect(result).toMatchObject({ name: 'Nexa InvoiceFlow' })

    const list = await store.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.proposedByAgentId).toBe('agent_1')
    expect(list[0]?.status).toBe('open')
  })

  it('rejects a payload missing required fields', async () => {
    const store = new InMemoryOpportunityStore()
    const executor = createProposeOpportunityExecutor(store)
    await expect(
      executor({ name: 'X' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(/propose_opportunity payload/)
  })
})

describe('runOpportunityDiscoveryOnce', () => {
  it('proposes opportunities end to end, auto-executing under step 18\'s policy', async () => {
    const opportunityStore = new InMemoryOpportunityStore()
    registerExecutor('propose_opportunity', createProposeOpportunityExecutor(opportunityStore))

    const agent: AgentRecord = {
      id: 'agent_1',
      businessId: 'biz_1',
      key: 'opportunity-discovery',
      role: 'testing',
      config: {},
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    }
    const agentStore = new InMemoryAgentStore(new Map([[agent.id, agent]]))
    const engine = createPermissionEngine({ agentStore, opportunityStore })

    const client = fakeToolClient('record_opportunity_proposals', {
      opportunities: [oneOpportunity(), oneOpportunity({ name: 'Nexa ClientPortal', problem: 'Scattered client files' })],
      reasoning: 'Two distinct freelancer-tooling gaps.',
      confidence: 0.65,
    })

    const result = await runOpportunityDiscoveryOnce(engine, client, 'biz_1', 'agent_1')
    expect(result.proposed).toBe(2)
    expect(result.outcomes.every((o) => o.status === 'executed')).toBe(true)

    const stored = await opportunityStore.list()
    expect(stored).toHaveLength(2)
    expect(stored.every((o) => o.proposedByAgentId === 'agent_1')).toBe(true)
  })

  it('passes existing opportunity names/problems to the model so it can avoid duplicates', async () => {
    const opportunityStore = new InMemoryOpportunityStore()
    await opportunityStore.create({
      name: 'Existing Idea',
      problem: 'Already recorded problem',
      targetCustomer: 'Someone',
      recommendation: 'MONITOR',
      scores: scores(),
    })
    registerExecutor('propose_opportunity', createProposeOpportunityExecutor(opportunityStore))

    const agent: AgentRecord = {
      id: 'agent_1',
      businessId: 'biz_1',
      key: 'opportunity-discovery',
      role: 'testing',
      config: {},
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    }
    const agentStore = new InMemoryAgentStore(new Map([[agent.id, agent]]))
    const engine = createPermissionEngine({ agentStore, opportunityStore })

    let capturedUserContent: unknown
    const client: MessagesClient = {
      messages: {
        async create(params) {
          capturedUserContent = params.messages
          return {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5',
            stop_reason: 'tool_use',
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [
              {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'record_opportunity_proposals',
                input: { opportunities: [oneOpportunity()], reasoning: 'ok', confidence: 0.5 },
              },
            ],
          } as never
        },
      },
    }

    await runOpportunityDiscoveryOnce(engine, client, 'biz_1', 'agent_1')
    expect(JSON.stringify(capturedUserContent)).toMatch(/Existing Idea/)
    expect(JSON.stringify(capturedUserContent)).toMatch(/Already recorded problem/)
  })
})
