import { randomUUID } from 'node:crypto'
import type { OwnerRecord, OwnerStore } from './store.js'

/**
 * No `create` here either — see the interface. Tests that need an owner
 * seed one directly via the constructor's initial records.
 */
export class InMemoryOwnerStore implements OwnerStore {
  private records = new Map<string, OwnerRecord>()

  constructor(initial: Array<{ email: string; passwordHash: string }> = []) {
    for (const { email, passwordHash } of initial) {
      const id = randomUUID()
      this.records.set(id, { id, email, passwordHash, createdAt: new Date().toISOString() })
    }
  }

  async findByEmail(email: string): Promise<OwnerRecord | undefined> {
    return [...this.records.values()].find((r) => r.email === email)
  }

  async get(ownerId: string): Promise<OwnerRecord | undefined> {
    return this.records.get(ownerId)
  }

  async listAll(): Promise<OwnerRecord[]> {
    return [...this.records.values()]
  }
}
