export type StoryScene = {
  sceneNumber: number
  visualDescription: string
  narrationOrLyricLine: string
  durationSeconds: number
}

export type StoryConceptRecord = {
  id: string
  businessId: string
  theme: string
  format: 'song' | 'story'
  title: string
  ageRange: string
  script: string
  scenes: StoryScene[]
  educationalTakeaway: string
  safetyNotes: string
  reasoning: string
  confidence?: number
  createdAt: string
  /** Set together, only once, only by post_story_concept_youtube's executor after a real upload succeeds — see markPosted(). */
  youtubeVideoId?: string
  youtubePostedAt?: string
}

export type StoryConceptInput = {
  theme: string
  format: 'song' | 'story'
  title: string
  ageRange: string
  script: string
  scenes: StoryScene[]
  educationalTakeaway: string
  safetyNotes: string
  reasoning: string
  confidence?: number
}

/**
 * Step 19: Sproutlight's Story Concept Agent drafts here — concept
 * generation itself doesn't go through requestAction()/approvals (same
 * reasoning as step 16's CampaignStore/ContentConceptStore): there's no
 * side effect yet for a human to approve, just a written concept to
 * review before anything expensive gets built on top of it.
 *
 * Posting a real video for a concept *is* a side effect, and does go
 * through requestAction() — see executors/postStoryConceptYoutube.ts.
 * markPosted() is that executor's own record of the outcome, called
 * nowhere else, same shape as ClipStore.markPosted().
 */
export interface StoryConceptStore {
  create(businessId: string, input: StoryConceptInput): Promise<string>
  get(id: string): Promise<StoryConceptRecord | undefined>
  /** Most recent first. */
  listByBusiness(businessId: string, limit?: number): Promise<StoryConceptRecord[]>
  /** Idempotency guard is the caller's (the executor checks !record.youtubeVideoId first) — this just writes. */
  markPosted(conceptId: string, youtubeVideoId: string): Promise<void>
}
