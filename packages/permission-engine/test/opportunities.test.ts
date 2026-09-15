import { describe, expect, it } from 'vitest'
import { computeTotalScore, assertOpportunityScores, SCORE_DIMENSIONS } from '../src/opportunities/scoring.js'
import { InMemoryOpportunityStore } from '../src/opportunities/memoryStore.js'
import type { OpportunityScores } from '../src/opportunities/scoring.js'
import type { OpportunityInput } from '../src/opportunities/store.js'

function fullScores(value: number): OpportunityScores {
  const scores = {} as Record<string, number>
  for (const { key } of SCORE_DIMENSIONS) scores[key] = value
  return scores as unknown as OpportunityScores
}

function baseInput(overrides: Partial<OpportunityInput> = {}): OpportunityInput {
  return {
    name: 'Test Opportunity',
    problem: 'People keep doing X by hand',
    targetCustomer: 'Small software teams',
    scores: fullScores(80),
    recommendation: 'BUILD MVP',
    ...overrides,
  }
}

describe('computeTotalScore', () => {
  it('averages all 12 dimensions and rounds', () => {
    expect(computeTotalScore(fullScores(80))).toBe(80)
  })

  it('rounds a fractional average', () => {
    const scores = fullScores(80)
    scores.marketDemand = 85 // pulls the average up by less than 1 full point across 12 dimensions
    // (960 + 5) / 12 = 80.4166... -> rounds to 80
    expect(computeTotalScore(scores)).toBe(80)
  })

  it('has no hidden weighting — bumping any one dimension by the same amount moves the total by the same amount', () => {
    const totals = SCORE_DIMENSIONS.map(({ key }) => {
      const scores = fullScores(50)
      scores[key] = 62 // +12 on a 12-dimension rubric -> +1 to the average, whichever dimension it is
      return computeTotalScore(scores)
    })
    expect(new Set(totals)).toEqual(new Set([51]))
  })
})

describe('assertOpportunityScores', () => {
  it('accepts a fully populated, in-range set of scores', () => {
    expect(() => assertOpportunityScores(fullScores(50))).not.toThrow()
  })

  it('rejects a missing dimension', () => {
    const scores = fullScores(50) as unknown as Record<string, number>
    delete scores.competition
    expect(() => assertOpportunityScores(scores)).toThrow(/competition/)
  })

  it('rejects an out-of-range score', () => {
    const scores = fullScores(50)
    scores.competition = 101
    expect(() => assertOpportunityScores(scores)).toThrow(/competition/)
    scores.competition = -1
    expect(() => assertOpportunityScores(scores)).toThrow(/competition/)
  })

  it('rejects a non-numeric score', () => {
    const scores = fullScores(50) as unknown as Record<string, unknown>
    scores.competition = 'high'
    expect(() => assertOpportunityScores(scores)).toThrow(/competition/)
  })
})

describe('InMemoryOpportunityStore', () => {
  it('creates and computes the total score server-side', async () => {
    const store = new InMemoryOpportunityStore()
    const id = await store.create(baseInput())
    const record = await store.get(id)
    expect(record?.totalScore).toBe(80)
    expect(record?.status).toBe('open')
    expect(record?.name).toBe('Test Opportunity')
  })

  it('rejects create with malformed scores', async () => {
    const store = new InMemoryOpportunityStore()
    await expect(
      store.create(baseInput({ scores: { ...fullScores(50), competition: 500 } }))
    ).rejects.toThrow(/competition/)
  })

  it('lists opportunities highest score first', async () => {
    const store = new InMemoryOpportunityStore()
    await store.create(baseInput({ name: 'Low', scores: fullScores(30) }))
    await store.create(baseInput({ name: 'High', scores: fullScores(90) }))
    await store.create(baseInput({ name: 'Mid', scores: fullScores(60) }))

    const list = await store.list()
    expect(list.map((o) => o.name)).toEqual(['High', 'Mid', 'Low'])
  })

  it('updates an opportunity and recomputes its total score', async () => {
    const store = new InMemoryOpportunityStore()
    const id = await store.create(baseInput({ scores: fullScores(50) }))
    await store.update(id, baseInput({ name: 'Renamed', scores: fullScores(70) }))

    const record = await store.get(id)
    expect(record?.name).toBe('Renamed')
    expect(record?.totalScore).toBe(70)
  })

  it('archives and reopens an opportunity', async () => {
    const store = new InMemoryOpportunityStore()
    const id = await store.create(baseInput())
    await store.setStatus(id, 'archived')
    expect((await store.get(id))?.status).toBe('archived')

    await store.setStatus(id, 'open')
    expect((await store.get(id))?.status).toBe('open')
  })

  it('throws for update/setStatus on an unknown id', async () => {
    const store = new InMemoryOpportunityStore()
    await expect(store.update('nope', baseInput())).rejects.toThrow(/no opportunity record/)
    await expect(store.setStatus('nope', 'archived')).rejects.toThrow(/no opportunity record/)
  })
})
