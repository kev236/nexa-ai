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
  /** Step 17: set when the Opportunity Discovery Agent proposed this row rather than the owner typing it in — see proposeOpportunity.ts. */
  proposedByAgentId?: string
  createdAt: string
  updatedAt: string
}

export type OpportunityInput = {
  name: string
  problem: string
  targetCustomer: string
  scores: OpportunityScores
  recommendation: string
  proposedByAgentId?: string
}

/**
 * Step 15: a manual scoring tool the owner fills in directly — no
 * business_id, since an opportunity describes a business that doesn't
 * exist yet. Step 17 added one agent-facing write path (proposeOpportunity's
 * executor, called through requestAction() like any other agent action)
 * alongside the owner's own direct writes; this store itself still has
 * no opinion about who's calling create() — see proposedByAgentId.
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
