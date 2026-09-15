import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import { InMemoryAgentStore } from '../src/agents/memoryStore.js'
import { InMemoryBusinessStore } from '../src/businesses/memoryStore.js'
import type { AgentRecord } from '../src/agents/store.js'
import type { JsonValue } from '../src/json.js'
import type { ActionRequest } from '../src/types.js'
import '../src/executors/noop.js'

const AGENT_ID = 'agent_1'
const BUSINESS_ID = 'biz_1'

function baseRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    businessId: BUSINESS_ID,
    agentId: AGENT_ID,
    actionType: 'noop',
    payload: {},
    reasoning: 'test exercise',
    expectedResult: {},
    confidence: 0.95,
    ...overrides,
  }
}

function level2Agent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: AGENT_ID,
    businessId: BUSINESS_ID,
    key: 'test-agent',
    role: 'testing',
    autonomyLevel: 2,
    config: { autoApproveMinConfidence: 0.9 },
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function engineWithCap(spendingConfig: JsonValue = {}) {
  const agentStore = new InMemoryAgentStore(new Map([[AGENT_ID, level2Agent()]]))
  const businessStore = new InMemoryBusinessStore(new Map([[BUSINESS_ID, spendingConfig]]))
  return createPermissionEngine({ agentStore, businessStore })
}

describe('spending limit — step 13 (readme.md Money section)', () => {
  it('does not constrain auto-approval when no cap is configured', async () => {
    const engine = engineWithCap({})
    const outcome = await engine.requestAction(
      baseRequest({ expectedCost: { amountCents: 999_999, currency: 'USD' } })
    )
    expect(outcome.status).toBe('executed')
  })

  it('does not constrain auto-approval when the request carries no cost', async () => {
    const engine = engineWithCap({ spendingLimitCents: 100, spendingLimitCurrency: 'USD', spendingLimitWindowHours: 24 })
    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('executed')
  })

  it('auto-approves a costed request that stays under the cap', async () => {
    const engine = engineWithCap({ spendingLimitCents: 1000, spendingLimitCurrency: 'USD', spendingLimitWindowHours: 24 })
    const outcome = await engine.requestAction(
      baseRequest({ expectedCost: { amountCents: 500, currency: 'USD' } })
    )
    expect(outcome.status).toBe('executed')
  })

  it('falls back to pending_approval once the cap would be exceeded', async () => {
    const engine = engineWithCap({ spendingLimitCents: 1000, spendingLimitCurrency: 'USD', spendingLimitWindowHours: 24 })
    const outcome = await engine.requestAction(
      baseRequest({ expectedCost: { amountCents: 1500, currency: 'USD' } })
    )
    expect(outcome.status).toBe('pending_approval')
  })

  it('allows a request landing exactly on the cap', async () => {
    const engine = engineWithCap({ spendingLimitCents: 1000, spendingLimitCurrency: 'USD', spendingLimitWindowHours: 24 })
    const outcome = await engine.requestAction(
      baseRequest({ expectedCost: { amountCents: 1000, currency: 'USD' } })
    )
    expect(outcome.status).toBe('executed')
  })

  it('counts prior executed spend against the cap (the ledger)', async () => {
    const engine = engineWithCap({ spendingLimitCents: 1000, spendingLimitCurrency: 'USD', spendingLimitWindowHours: 24 })

    const first = await engine.requestAction(baseRequest({ expectedCost: { amountCents: 700, currency: 'USD' } }))
    expect(first.status).toBe('executed')

    const second = await engine.requestAction(baseRequest({ expectedCost: { amountCents: 400, currency: 'USD' } }))
    expect(second.status).toBe('pending_approval') // 700 + 400 > 1000
  })

  it('two concurrent requests cannot both slip under the same cap', async () => {
    const engine = engineWithCap({ spendingLimitCents: 1000, spendingLimitCurrency: 'USD', spendingLimitWindowHours: 24 })

    const [a, b] = await Promise.all([
      engine.requestAction(baseRequest({ expectedCost: { amountCents: 700, currency: 'USD' } })),
      engine.requestAction(baseRequest({ expectedCost: { amountCents: 700, currency: 'USD' } })),
    ])

    // Both requested 700 against a 1000 cap — together they exceed it, so
    // the unsafe outcome is both auto-executing (1400 spent against a
    // 1000 cap). Each creates its own pending approval before either
    // checks the cap sum, so whichever checks second always sees the
    // other's grant already counted — this is the race readme.md's
    // "ledger plus outstanding unconsumed grants" line exists to
    // prevent. At most one may execute; both falling back to
    // pending_approval is also a safe (if conservative) outcome — the
    // one outcome that would violate the cap is disallowed either way.
    for (const status of [a.status, b.status]) {
      expect(['executed', 'pending_approval']).toContain(status)
    }
    const executedCount = [a.status, b.status].filter((s) => s === 'executed').length
    expect(executedCount).toBeLessThanOrEqual(1)
  })

  it('fails closed on a currency mismatch rather than guessing an FX rate', async () => {
    const engine = engineWithCap({ spendingLimitCents: 100_000, spendingLimitCurrency: 'USD', spendingLimitWindowHours: 24 })
    const outcome = await engine.requestAction(
      baseRequest({ expectedCost: { amountCents: 1, currency: 'EUR' } })
    )
    expect(outcome.status).toBe('pending_approval')
  })

  it('treats a partially-configured cap as unconfigured, not a crash', async () => {
    // spendingLimitWindowHours is missing — readSpendingLimitConfig()
    // requires all three keys together.
    const engine = engineWithCap({ spendingLimitCents: 100, spendingLimitCurrency: 'USD' })
    const outcome = await engine.requestAction(
      baseRequest({ expectedCost: { amountCents: 999_999, currency: 'USD' } })
    )
    expect(outcome.status).toBe('executed')
  })
})
