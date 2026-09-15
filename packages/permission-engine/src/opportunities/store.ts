import type { OpportunityScores } from './scoring.js'

export type OpportunityRecord = {
  id: string
  name: string
  problem: string
  targetCustomer: string
  scores: OpportunityScores
  totalScore: number
  recommendation: string
  status: 'open' | 'archived'
  createdAt: string
  updatedAt: string
}

export type OpportunityInput = {
  name: string
  problem: string
  targetCustomer: string
  scores: OpportunityScores
  recommendation: string
}

/**
 * Step 15: a manual scoring tool, not an action — no agent or executor
 * ever touches this store, so unlike every other write path in this
 * system it does not go through requestAction()/approvals. It's admin
 * data the owner authors directly, same trust level as an owner account
 * (OwnerStore), not customer-facing or money-moving.
 */
export interface OpportunityStore {
  /** totalScore is computed server-side from scores, never accepted from the caller. */
  create(input: OpportunityInput): Promise<string>
  update(id: string, input: OpportunityInput): Promise<void>
  setStatus(id: string, status: 'open' | 'archived'): Promise<void>
  get(id: string): Promise<OpportunityRecord | undefined>
  /** Highest total score first. */
  list(): Promise<OpportunityRecord[]>
}
