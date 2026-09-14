import type { JsonValue } from '../json.js'

export type DecisionRecord = {
  id: string
  businessId: string
  agentId?: string
  eventId?: string
  actionType: string
  reasoning: string
  expectedResult: JsonValue
  actualResult?: JsonValue
  confidence?: number
  createdAt: string
  resolvedAt?: string
}

export type DecisionInput = {
  businessId: string
  agentId?: string
  eventId?: string
  actionType: string
  reasoning: string
  expectedResult: JsonValue
  confidence?: number
}

export interface DecisionStore {
  record(input: DecisionInput): Promise<string>
  /** Idempotency check for agents that process events — has this one already been triaged? */
  hasDecisionForEvent(eventId: string): Promise<boolean>
  listByBusiness(businessId: string, limit?: number): Promise<DecisionRecord[]>
}
