import type { ContentConcept } from './types.js'

export type ContentConceptRunRecord = {
  id: string
  campaignId: string
  businessId: string
  agentId?: string
  concepts: ContentConcept[]
  reasoning: string
  confidence?: number
  status: 'draft' | 'reviewed'
  createdAt: string
}

export type ContentConceptRunInput = {
  campaignId: string
  businessId: string
  agentId?: string
  concepts: ContentConcept[]
  reasoning: string
  confidence?: number
}

/**
 * Step 16: one row per Creative Agent run over a campaign. Same
 * not-routed-through-requestAction reasoning as CampaignStore — drafting
 * scored concepts has no side effect yet for a human to approve.
 */
export interface ContentConceptStore {
  create(input: ContentConceptRunInput): Promise<string>
  get(id: string): Promise<ContentConceptRunRecord | undefined>
  markReviewed(id: string): Promise<void>
  /** Most recent first. */
  listByCampaign(campaignId: string, limit?: number): Promise<ContentConceptRunRecord[]>
}
