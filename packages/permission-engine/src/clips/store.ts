import type { Platform } from '../socialAccounts/store.js'

export type ClipCaption = {
  platform: Platform
  caption: string
  hashtags: string[]
}

export type ClipRecord = {
  id: string
  businessId: string
  sourceUrl?: string
  sourceDescription: string
  title: string
  viralityScore: number
  copyrightRisk: 'low' | 'medium' | 'high'
  copyrightNotes: string
  recommendation: string
  captions: ClipCaption[]
  reasoning: string
  confidence?: number
  createdAt: string
}

export type ClipInput = {
  sourceUrl?: string
  sourceDescription: string
  title: string
  viralityScore: number
  copyrightRisk: 'low' | 'medium' | 'high'
  copyrightNotes: string
  recommendation: string
  captions: ClipCaption[]
  reasoning: string
  confidence?: number
}

/**
 * Step 23: TrendRush's Clip Discovery Agent drafts here — no repost
 * executor exists yet, so (same reasoning as
 * OpportunityStore/CampaignStore/StoryConceptStore) this doesn't go
 * through requestAction()/approvals: there's no side effect yet for a
 * human to approve, just a written evaluation to review before
 * spending time producing and posting anything.
 */
export interface ClipStore {
  create(businessId: string, input: ClipInput): Promise<string>
  get(id: string): Promise<ClipRecord | undefined>
  /** Most recent first. */
  listByBusiness(businessId: string, limit?: number): Promise<ClipRecord[]>
}
