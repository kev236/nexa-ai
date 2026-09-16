import { randomUUID } from 'node:crypto'
import type { StoryConceptInput, StoryConceptRecord, StoryConceptStore } from './store.js'

export class InMemoryStoryConceptStore implements StoryConceptStore {
  private records = new Map<string, StoryConceptRecord>()

  async create(businessId: string, input: StoryConceptInput): Promise<string> {
    const id = randomUUID()
    this.records.set(id, {
      id,
      businessId,
      theme: input.theme,
      format: input.format,
      title: input.title,
      ageRange: input.ageRange,
      script: input.script,
      scenes: input.scenes,
      educationalTakeaway: input.educationalTakeaway,
      safetyNotes: input.safetyNotes,
      reasoning: input.reasoning,
      confidence: input.confidence,
      createdAt: new Date().toISOString(),
    })
    return id
  }

  async get(id: string): Promise<StoryConceptRecord | undefined> {
    return this.records.get(id)
  }

  async listByBusiness(businessId: string, limit = 100): Promise<StoryConceptRecord[]> {
    // Ascending then reverse — see CampaignStore's memory implementation
    // for why a direct descending sort of ISO strings isn't safe here.
    return [...this.records.values()]
      .filter((r) => r.businessId === businessId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .reverse()
      .slice(0, limit)
  }
}
