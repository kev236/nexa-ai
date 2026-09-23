import { randomUUID } from 'node:crypto'
import type { ApiKeyRequestRecord, ApiKeyRequestStore } from './requestStore.js'

export class InMemoryApiKeyRequestStore implements ApiKeyRequestStore {
  private records = new Map<string, ApiKeyRequestRecord>()

  async create(email: string, useCase: string): Promise<ApiKeyRequestRecord> {
    const id = randomUUID()
    const record: ApiKeyRequestRecord = { id, email, useCase, createdAt: new Date().toISOString() }
    this.records.set(id, record)
    return record
  }

  async listPending(): Promise<ApiKeyRequestRecord[]> {
    return [...this.records.values()]
      .filter((r) => !r.fulfilledAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .reverse()
  }

  async markFulfilled(id: string): Promise<void> {
    const record = this.records.get(id)
    if (!record) throw new Error(`no such API key request: ${id}`)
    record.fulfilledAt = new Date().toISOString()
  }
}
