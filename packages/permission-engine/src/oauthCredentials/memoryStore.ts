import { randomUUID } from 'node:crypto'
import type { OAuthCredentialRecord, OAuthCredentialStore, OAuthPlatform } from './store.js'

export class InMemoryOAuthCredentialStore implements OAuthCredentialStore {
  private records = new Map<string, OAuthCredentialRecord>()

  async save(
    businessId: string,
    platform: OAuthPlatform,
    tokens: { accessToken: string; refreshToken?: string; expiresAt: string; scope: string }
  ): Promise<void> {
    const existing = [...this.records.values()].find((r) => r.businessId === businessId && r.platform === platform)
    const now = new Date().toISOString()
    if (existing) {
      existing.accessToken = tokens.accessToken
      existing.refreshToken = tokens.refreshToken || existing.refreshToken
      existing.expiresAt = tokens.expiresAt
      existing.scope = tokens.scope
      existing.updatedAt = now
      return
    }
    if (!tokens.refreshToken) {
      throw new Error(`no refresh token available for a first-time ${platform} authorization`)
    }
    const id = randomUUID()
    this.records.set(id, {
      id,
      businessId,
      platform,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      createdAt: now,
      updatedAt: now,
    })
  }

  async get(businessId: string, platform: OAuthPlatform): Promise<OAuthCredentialRecord | undefined> {
    return [...this.records.values()].find((r) => r.businessId === businessId && r.platform === platform)
  }
}
