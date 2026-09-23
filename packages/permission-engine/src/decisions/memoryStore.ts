import { randomUUID } from 'node:crypto'
import type { DecisionInput, DecisionRecord, DecisionStore } from './store.js'

export class InMemoryDecisionStore implements DecisionStore {
  private records = new Map<string, DecisionRecord>()

  async record(input: DecisionInput): Promise<string> {
    const id = randomUUID()
    this.records.set(id, {
      id,
      businessId: input.businessId,
      agentId: input.agentId,
      eventId: input.eventId,
      actionType: input.actionType,
      reasoning: input.reasoning,
      expectedResult: input.expectedResult,
      confidence: input.confidence,
      createdAt: new Date().toISOString(),
    })
    return id
  }

  async hasDecisionForEvent(eventId: string): Promise<boolean> {
    return [...this.records.values()].some((r) => r.eventId === eventId)
  }

  async listByBusiness(businessId: string, limit = 100): Promise<DecisionRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.businessId === businessId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
  }
}
