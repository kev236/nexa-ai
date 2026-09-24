import { randomUUID } from 'node:crypto'
import { LOCKOUT_DURATION_MS, MAX_FAILED_ATTEMPTS, type TrustedPersonRecord, type TrustedPeopleStore } from './store.js'
import { hashPassword, verifyPassword } from '../password.js'

export class InMemoryTrustedPeopleStore implements TrustedPeopleStore {
  private records = new Map<string, TrustedPersonRecord>()

  async add(name: string, pin: string, addedByOwnerId: string): Promise<TrustedPersonRecord> {
    const id = randomUUID()
    const record: TrustedPersonRecord = {
      id,
      name,
      pinHash: hashPassword(pin),
      addedByOwnerId,
      createdAt: new Date().toISOString(),
      failedAttempts: 0,
    }
    this.records.set(id, record)
    return record
  }

  async listAll(): Promise<TrustedPersonRecord[]> {
    return [...this.records.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).reverse()
  }

  async revoke(id: string): Promise<void> {
    const record = this.records.get(id)
    if (!record) throw new Error(`no such trusted person: ${id}`)
    record.revokedAt = new Date().toISOString()
  }

  async verify(name: string, pin: string): Promise<TrustedPersonRecord | undefined> {
    const now = Date.now()
    const candidates = [...this.records.values()].filter(
      (r) => !r.revokedAt && r.name.trim().toLowerCase() === name.trim().toLowerCase()
    )
    for (const candidate of candidates) {
      if (candidate.lockedUntil && new Date(candidate.lockedUntil).getTime() > now) {
        continue // locked out — don't even check the PIN against this one
      }
      if (verifyPassword(pin, candidate.pinHash)) {
        candidate.lastUsedAt = new Date().toISOString()
        candidate.failedAttempts = 0
        candidate.lockedUntil = undefined
        return candidate
      }
      candidate.failedAttempts += 1
      if (candidate.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        candidate.lockedUntil = new Date(now + LOCKOUT_DURATION_MS).toISOString()
        candidate.failedAttempts = 0
      }
    }
    return undefined
  }
}
