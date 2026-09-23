import { randomUUID } from 'node:crypto'
import type { Platform, SocialAccountRecord, SocialAccountStore } from './store.js'

export class InMemorySocialAccountStore implements SocialAccountStore {
  private records = new Map<string, SocialAccountRecord>()

  async setFollowerCount(
    businessId: string,
    platform: Platform,
    followerCount: number,
    handle?: string
  ): Promise<void> {
    const existing = [...this.records.values()].find((r) => r.businessId === businessId && r.platform === platform)
    const now = new Date().toISOString()
    if (existing) {
      existing.followerCount = followerCount
      existing.handle = handle ?? existing.handle
      existing.updatedAt = now
      return
    }
    const id = randomUUID()
    this.records.set(id, { id, businessId, platform, handle, followerCount, createdAt: now, updatedAt: now })
  }

  async listByBusiness(businessId: string): Promise<SocialAccountRecord[]> {
    return [...this.records.values()].filter((r) => r.businessId === businessId)
  }
}
