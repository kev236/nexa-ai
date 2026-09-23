import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { ApiKeyRecord, ApiKeyStore } from './store.js'
import { generateApiKey, hashApiKey } from './crypto.js'

type Row = {
  id: string
  name: string
  key_hash: string
  request_count: number
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

function toRecord(row: Row): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    requestCount: row.request_count,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
  }
}

export class PostgresApiKeyStore implements ApiKeyStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async create(name: string): Promise<{ record: ApiKeyRecord; plaintextKey: string }> {
    const plaintextKey = generateApiKey()
    const result = await this.pool.query<Row>(
      `INSERT INTO api_keys (name, key_hash, created_at) VALUES ($1, $2, now()) RETURNING *`,
      [name, hashApiKey(plaintextKey)]
    )
    const row = result.rows[0]
    if (!row) throw new Error('api_keys insert returned no row')
    return { record: toRecord(row), plaintextKey }
  }

  async findActiveByPlaintextKey(plaintextKey: string): Promise<ApiKeyRecord | undefined> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
      [hashApiKey(plaintextKey)]
    )
    return result.rows[0] ? toRecord(result.rows[0]) : undefined
  }

  async recordUsage(id: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE api_keys SET request_count = request_count + 1, last_used_at = now() WHERE id = $1`,
      [id]
    )
    if (result.rowCount === 0) throw new Error(`no such API key: ${id}`)
  }

  async revoke(id: string): Promise<void> {
    const result = await this.pool.query(`UPDATE api_keys SET revoked_at = now() WHERE id = $1`, [id])
    if (result.rowCount === 0) throw new Error(`no such API key: ${id}`)
  }

  async listAll(): Promise<ApiKeyRecord[]> {
    const result = await this.pool.query<Row>(`SELECT * FROM api_keys ORDER BY created_at DESC`)
    return result.rows.map(toRecord)
  }
}

export function createPostgresApiKeyStore(): ApiKeyStore {
  return new PostgresApiKeyStore()
}
