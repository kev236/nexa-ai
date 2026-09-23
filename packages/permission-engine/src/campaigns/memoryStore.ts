import { randomUUID } from 'node:crypto'
import type { CampaignInput, CampaignRecord, CampaignStore } from './store.js'

export class InMemoryCampaignStore implements CampaignStore {
  private records = new Map<string, CampaignRecord>()

  async create(businessId: string, input: CampaignInput): Promise<{ id: string; inserted: boolean }> {
    if (input.externalId) {
      const existing = [...this.records.values()].find(
        (r) => r.businessId === businessId && r.externalId === input.externalId
      )
      if (existing) return { id: existing.id, inserted: false }
    }

    const id = randomUUID()
    const now = new Date().toISOString()
    this.records.set(id, {
      id,
      businessId,
      externalId: input.externalId,
      product: input.product,
      targetAudience: input.targetAudience,
      problem: input.problem,
      benefits: input.benefits ?? [],
      uniqueSellingPoints: input.uniqueSellingPoints ?? [],
      allowedClaims: input.allowedClaims ?? [],
      forbiddenClaims: input.forbiddenClaims ?? [],
      cta: input.cta,
      landingPage: input.landingPage,
      availableAssets: input.availableAssets ?? [],
      rawInput: input.rawInput,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    return { id, inserted: true }
  }

  async get(id: string): Promise<CampaignRecord | undefined> {
    return this.records.get(id)
  }

  async setStatus(id: string, status: CampaignRecord['status']): Promise<void> {
    const record = this.records.get(id)
    if (!record) throw new Error(`no campaign record for id ${id}`)
    record.status = status
    record.updatedAt = new Date().toISOString()
  }

  async listByBusiness(businessId: string, limit = 100): Promise<CampaignRecord[]> {
    // Ascending then reverse, not a direct descending sort — see
    // audit/memoryStore.ts's listByBusiness for why (stable-sort ties on
    // same-millisecond createdAt values).
    return [...this.records.values()]
      .filter((r) => r.businessId === businessId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .reverse()
      .slice(0, limit)
  }
}
