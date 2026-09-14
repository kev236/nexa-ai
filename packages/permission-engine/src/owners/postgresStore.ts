import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { OwnerRecord, OwnerStore } from './store.js'

type Row = {
  id: string
  email: string
  password_hash: string
  created_at: string
}

function toRecord(row: Row): OwnerRecord {
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at }
}

/**
 * Deliberately no `create` — owner accounts are created only by
 * db/createOwner.mjs, a deploy-time script run directly by a trusted
 * operator, never reachable through this package's application-facing
 * API. There is no self-service signup for a system with one owner.
 */
export class PostgresOwnerStore implements OwnerStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async findByEmail(email: string): Promise<OwnerRecord | undefined> {
    const result = await this.pool.query<Row>('SELECT * FROM owners WHERE email = $1', [email])
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async get(ownerId: string): Promise<OwnerRecord | undefined> {
    const result = await this.pool.query<Row>('SELECT * FROM owners WHERE id = $1', [ownerId])
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async listAll(): Promise<OwnerRecord[]> {
    const result = await this.pool.query<Row>('SELECT * FROM owners ORDER BY created_at ASC')
    return result.rows.map(toRecord)
  }
}

export function createPostgresOwnerStore(): OwnerStore {
  return new PostgresOwnerStore()
}
