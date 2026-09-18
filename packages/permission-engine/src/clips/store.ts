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
  /** Step 27: set together, only once, only by post_clip_youtube's executor after a real upload succeeds — see markPosted(). */
  youtubeVideoId?: string
  youtubePostedAt?: string
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
 * Step 23: TrendRush's Clip Discovery Agent drafts here — evaluation
 * itself doesn't go through requestAction()/approvals (same reasoning
 * as OpportunityStore/CampaignStore/StoryConceptStore): scoring a clip
 * has no side effect yet for a human to approve.
 *
 * Step 27 added the repost executor migration 0018's comment noted was
 * still missing — posting itself *does* go through requestAction()
 * (it's a real, public, business-visible side effect), and markPosted()
 * is that executor's own record of the outcome, called nowhere else.
 */
export interface ClipStore {
  create(businessId: string, input: ClipInput): Promise<string>
  get(id: string): Promise<ClipRecord | undefined>
  /** Most recent first. */
  listByBusiness(businessId: string, limit?: number): Promise<ClipRecord[]>
  /** Idempotency guard is the caller's (the executor checks !record.youtubeVideoId first) — this just writes. */
  markPosted(clipId: string, youtubeVideoId: string): Promise<void>
}
