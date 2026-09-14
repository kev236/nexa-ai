import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { JsonValue } from '../json.js'
import type { BusinessStore } from './store.js'

export class PostgresBusinessStore implements BusinessStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async getConfig(businessId: string): Promise<JsonValue> {
    const result = await this.pool.query<{ config: JsonValue }>(
      `SELECT config FROM businesses WHERE id = $1`,
      [businessId]
    )
    return result.rows[0]?.config ?? {}
  }
}

export function createPostgresBusinessStore(): BusinessStore {
  return new PostgresBusinessStore()
}
