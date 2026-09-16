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
 * Step 19: Sproutlight's Story Concept Agent drafts here — no video,
 * audio, or publishing exists yet, so (same reasoning as step 16's
 * CampaignStore/ContentConceptStore) this doesn't go through
 * requestAction()/approvals: there's no side effect yet for a human to
 * approve, just a written concept to review before anything expensive
 * gets built on top of it.
 */
export interface StoryConceptStore {
  create(businessId: string, input: StoryConceptInput): Promise<string>
  get(id: string): Promise<StoryConceptRecord | undefined>
  /** Most recent first. */
  listByBusiness(businessId: string, limit?: number): Promise<StoryConceptRecord[]>
}
