import { randomUUID } from 'node:crypto'
import type { Platform } from '../socialAccounts/store.js'
import type { ClipInput, ClipRecord, ClipStore } from './store.js'

export class InMemoryClipStore implements ClipStore {
  private records = new Map<string, ClipRecord>()

  async create(businessId: string, input: ClipInput): Promise<string> {
    const id = randomUUID()
    this.records.set(id, {
      id,
      businessId,
      sourceUrl: input.sourceUrl,
      sourceDescription: input.sourceDescription,
      title: input.title,
      viralityScore: input.viralityScore,
      copyrightRisk: input.copyrightRisk,
      copyrightNotes: input.copyrightNotes,
      recommendation: input.recommendation,
      captions: input.captions,
      reasoning: input.reasoning,
      confidence: input.confidence,
      createdAt: new Date().toISOString(),
    })
    return id
  }

  async get(id: string): Promise<ClipRecord | undefined> {
    return this.records.get(id)
  }

  async listByBusiness(businessId: string, limit = 100): Promise<ClipRecord[]> {
    // Ascending then reverse, not a direct descending sort — see
    // audit/memoryStore.ts's listByBusiness for why (stable-sort ties on
    // same-millisecond createdAt values).
    return [...this.records.values()]
      .filter((r) => r.businessId === businessId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .reverse()
      .slice(0, limit)
  }

  async markPosted(clipId: string, platform: Platform, externalId: string): Promise<void> {
    const record = this.records.get(clipId)
    if (!record) throw new Error(`no such clip: ${clipId}`)
    const now = new Date().toISOString()
    if (platform === 'youtube') {
      record.youtubeVideoId = externalId
      record.youtubePostedAt = now
    } else if (platform === 'instagram') {
      record.instagramMediaId = externalId
      record.instagramPostedAt = now
    } else {
      record.tiktokPublishId = externalId
      record.tiktokPostedAt = now
    }
  }
}
