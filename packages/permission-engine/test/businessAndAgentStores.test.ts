import { describe, expect, it } from 'vitest'
import { InMemoryBusinessStore } from '../src/businesses/memoryStore.js'
import { InMemoryAgentStore } from '../src/agents/memoryStore.js'
import type { AgentRecord } from '../src/agents/store.js'
import type { BusinessRecord } from '../src/businesses/store.js'

describe('InMemoryBusinessStore.getBySlug', () => {
  it('finds a business by slug', async () => {
    const record: BusinessRecord = { id: 'biz_1', slug: 'nexa-labs', name: 'Nexa Labs', status: 'active' }
    const store = new InMemoryBusinessStore(undefined, new Map([['biz_1', record]]))
    expect(await store.getBySlug('nexa-labs')).toEqual(record)
  })

  it('returns undefined for an unknown slug', async () => {
    const store = new InMemoryBusinessStore()
    expect(await store.getBySlug('does-not-exist')).toBeUndefined()
  })
})

describe('InMemoryAgentStore', () => {
  const agent: AgentRecord = {
    id: 'agent_1',
    businessId: 'biz_1',
    key: 'waitlist-triage',
    role: 'Drafts replies to waitlist signups',
    autonomyLevel: 1,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
  }

  it('finds an agent by business and key', async () => {
    const store = new InMemoryAgentStore(new Map([['agent_1', agent]]))
    expect(await store.getByKey('biz_1', 'waitlist-triage')).toEqual(agent)
    expect(await store.getByKey('biz_1', 'no-such-key')).toBeUndefined()
    expect(await store.getByKey('biz_2', 'waitlist-triage')).toBeUndefined()
  })

  it('lists agents scoped to one business, oldest first', async () => {
    const other: AgentRecord = { ...agent, id: 'agent_2', businessId: 'biz_2', key: 'other' }
    const store = new InMemoryAgentStore(
      new Map([
        ['agent_1', agent],
        ['agent_2', other],
      ])
    )
    const list = await store.listByBusiness('biz_1')
    expect(list).toEqual([agent])
  })
})
