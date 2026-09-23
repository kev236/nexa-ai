import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { ApiKeyRequestRecord, ApiKeyRequestStore } from './requestStore.js'

type Row = {
  id: string
  email: string
  use_case: string
  created_at: string
  fulfilled_at: string | null
}

function toRecord(row: Row): ApiKeyRequestRecord {
  return {
    id: row.id,
    email: row.email,
    useCase: row.use_case,
    createdAt: row.created_at,
    fulfilledAt: row.fulfilled_at ?? undefined,
  }
}

export class PostgresApiKeyRequestStore implements ApiKeyRequestStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async create(email: string, useCase: string): Promise<ApiKeyRequestRecord> {
    const result = await this.pool.query<Row>(
      `INSERT INTO api_key_requests (email, use_case, created_at) VALUES ($1, $2, now()) RETURNING *`,
      [email, useCase]
    )
    const row = result.rows[0]
    if (!row) throw new Error('api_key_requests insert returned no row')
    return toRecord(row)
  }

  async listPending(): Promise<ApiKeyRequestRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM api_key_requests WHERE fulfilled_at IS NULL ORDER BY created_at DESC`
    )
    return result.rows.map(toRecord)
  }

  async markFulfilled(id: string): Promise<void> {
    const result = await this.pool.query(`UPDATE api_key_requests SET fulfilled_at = now() WHERE id = $1`, [id])
    if (result.rowCount === 0) throw new Error(`no such API key request: ${id}`)
  }
}

export function createPostgresApiKeyRequestStore(): ApiKeyRequestStore {
  return new PostgresApiKeyRequestStore()
}
