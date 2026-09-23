import { randomUUID } from 'node:crypto'
import type { ApiKeyRecord, ApiKeyStore } from './store.js'
import { generateApiKey, hashApiKey } from './crypto.js'

export class InMemoryApiKeyStore implements ApiKeyStore {
  private records = new Map<string, ApiKeyRecord>()

  async create(name: string): Promise<{ record: ApiKeyRecord; plaintextKey: string }> {
    const plaintextKey = generateApiKey()
    const id = randomUUID()
    const record: ApiKeyRecord = {
      id,
      name,
      keyHash: hashApiKey(plaintextKey),
      requestCount: 0,
      createdAt: new Date().toISOString(),
    }
    this.records.set(id, record)
    return { record, plaintextKey }
  }

  async findActiveByPlaintextKey(plaintextKey: string): Promise<ApiKeyRecord | undefined> {
    const hash = hashApiKey(plaintextKey)
    return [...this.records.values()].find((r) => r.keyHash === hash && !r.revokedAt)
  }

  async recordUsage(id: string): Promise<void> {
    const record = this.records.get(id)
    if (!record) throw new Error(`no such API key: ${id}`)
    record.requestCount += 1
    record.lastUsedAt = new Date().toISOString()
  }

  async revoke(id: string): Promise<void> {
    const record = this.records.get(id)
    if (!record) throw new Error(`no such API key: ${id}`)
    record.revokedAt = new Date().toISOString()
  }

  async listAll(): Promise<ApiKeyRecord[]> {
    // Ascending then reverse, not a direct descending sort — same
    // same-millisecond-createdAt tie-breaking reasoning as
    // clips/memoryStore.ts and audit/memoryStore.ts's identical pattern.
    return [...this.records.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).reverse()
  }
}
