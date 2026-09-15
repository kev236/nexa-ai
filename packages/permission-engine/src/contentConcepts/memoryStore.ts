import { randomUUID } from 'node:crypto'
import type { ContentConceptRunInput, ContentConceptRunRecord, ContentConceptStore } from './store.js'

export class InMemoryContentConceptStore implements ContentConceptStore {
  private records = new Map<string, ContentConceptRunRecord>()

  async create(input: ContentConceptRunInput): Promise<string> {
    const id = randomUUID()
    this.records.set(id, {
      id,
      campaignId: input.campaignId,
      businessId: input.businessId,
      agentId: input.agentId,
      concepts: input.concepts,
      reasoning: input.reasoning,
      confidence: input.confidence,
      status: 'draft',
      createdAt: new Date().toISOString(),
    })
    return id
  }

  async get(id: string): Promise<ContentConceptRunRecord | undefined> {
    return this.records.get(id)
  }

  async markReviewed(id: string): Promise<void> {
    const record = this.records.get(id)
    if (!record) throw new Error(`no content concept run for id ${id}`)
    record.status = 'reviewed'
  }

  async listByCampaign(campaignId: string, limit = 100): Promise<ContentConceptRunRecord[]> {
    // Ascending then reverse — see CampaignStore's memory implementation
    // for why a direct descending sort isn't safe here.
    return [...this.records.values()]
      .filter((r) => r.campaignId === campaignId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .reverse()
      .slice(0, limit)
  }
}
