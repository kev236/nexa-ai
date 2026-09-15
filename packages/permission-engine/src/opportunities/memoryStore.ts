import { randomUUID } from 'node:crypto'
import { assertOpportunityScores, computeTotalScore } from './scoring.js'
import type { OpportunityInput, OpportunityRecord, OpportunityStore } from './store.js'

export class InMemoryOpportunityStore implements OpportunityStore {
  private records = new Map<string, OpportunityRecord>()

  async create(input: OpportunityInput): Promise<string> {
    assertOpportunityScores(input.scores)
    const id = randomUUID()
    const now = new Date().toISOString()
    this.records.set(id, {
      id,
      name: input.name,
      problem: input.problem,
      targetCustomer: input.targetCustomer,
      scores: input.scores,
      totalScore: computeTotalScore(input.scores),
      recommendation: input.recommendation,
      status: 'open',
      proposedByAgentId: input.proposedByAgentId,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  async update(id: string, input: OpportunityInput): Promise<void> {
    assertOpportunityScores(input.scores)
    const record = this.mustGet(id)
    record.name = input.name
    record.problem = input.problem
    record.targetCustomer = input.targetCustomer
    record.scores = input.scores
    record.totalScore = computeTotalScore(input.scores)
    record.recommendation = input.recommendation
    record.updatedAt = new Date().toISOString()
  }

  async setStatus(id: string, status: 'open' | 'archived'): Promise<void> {
    const record = this.mustGet(id)
    record.status = status
    record.updatedAt = new Date().toISOString()
  }

  async get(id: string): Promise<OpportunityRecord | undefined> {
    return this.records.get(id)
  }

  async list(): Promise<OpportunityRecord[]> {
    return [...this.records.values()].sort((a, b) => b.totalScore - a.totalScore)
  }

  private mustGet(id: string): OpportunityRecord {
    const record = this.records.get(id)
    if (!record) throw new Error(`no opportunity record for id ${id}`)
    return record
  }
}
