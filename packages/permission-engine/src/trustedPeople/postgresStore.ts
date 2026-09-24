import type { Pool } from 'pg'
import { getPool } from '../db.js'
import { LOCKOUT_DURATION_MS, MAX_FAILED_ATTEMPTS, type TrustedPersonRecord, type TrustedPeopleStore } from './store.js'
import { hashPassword, verifyPassword } from '../password.js'

type Row = {
  id: string
  name: string
  pin_hash: string
  added_by_owner_id: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  failed_attempts: number
  locked_until: string | null
}

function toRecord(row: Row): TrustedPersonRecord {
  return {
    id: row.id,
    name: row.name,
    pinHash: row.pin_hash,
    addedByOwnerId: row.added_by_owner_id,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until ?? undefined,
  }
}

export class PostgresTrustedPeopleStore implements TrustedPeopleStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async add(name: string, pin: string, addedByOwnerId: string): Promise<TrustedPersonRecord> {
    const result = await this.pool.query<Row>(
      `INSERT INTO trusted_people (name, pin_hash, added_by_owner_id, created_at) VALUES ($1, $2, $3, now()) RETURNING *`,
      [name, hashPassword(pin), addedByOwnerId]
    )
    const row = result.rows[0]
    if (!row) throw new Error('trusted_people insert returned no row')
    return toRecord(row)
  }

  async listAll(): Promise<TrustedPersonRecord[]> {
    const result = await this.pool.query<Row>(`SELECT * FROM trusted_people ORDER BY created_at DESC`)
    return result.rows.map(toRecord)
  }

  async revoke(id: string): Promise<void> {
    const result = await this.pool.query(`UPDATE trusted_people SET revoked_at = now() WHERE id = $1`, [id])
    if (result.rowCount === 0) throw new Error(`no such trusted person: ${id}`)
  }

  async verify(name: string, pin: string): Promise<TrustedPersonRecord | undefined> {
    // Matched in the database (case-insensitive, active only), verified
    // in application code — more than one active record can share a
    // display name, so every candidate's PIN hash gets a real
    // timing-safe check via verifyPassword rather than trusting a
    // single indexed lookup to pick the right one.
    const result = await this.pool.query<Row>(
      `SELECT * FROM trusted_people WHERE lower(name) = lower($1) AND revoked_at IS NULL`,
      [name.trim()]
    )
    const now = Date.now()
    for (const row of result.rows) {
      if (row.locked_until && new Date(row.locked_until).getTime() > now) {
        continue // locked out — don't even check the PIN against this one
      }
      if (verifyPassword(pin, row.pin_hash)) {
        await this.pool.query(
          `UPDATE trusted_people SET last_used_at = now(), failed_attempts = 0, locked_until = NULL WHERE id = $1`,
          [row.id]
        )
        return toRecord({ ...row, last_used_at: new Date().toISOString(), failed_attempts: 0, locked_until: null })
      }
      const failedAttempts = row.failed_attempts + 1
      const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now + LOCKOUT_DURATION_MS) : null
      await this.pool.query(
        `UPDATE trusted_people SET failed_attempts = $2, locked_until = $3 WHERE id = $1`,
        [row.id, lockedUntil ? 0 : failedAttempts, lockedUntil]
      )
    }
    return undefined
  }
}

export function createPostgresTrustedPeopleStore(): TrustedPeopleStore {
  return new PostgresTrustedPeopleStore()
}
