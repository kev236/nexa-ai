import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { JsonValue } from '../json.js'
import type { BusinessRecord, BusinessStore } from './store.js'

export class PostgresBusinessStore implements BusinessStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async getConfig(businessId: string): Promise<JsonValue> {
    const result = await this.pool.query<{ config: JsonValue }>(
      `SELECT config FROM businesses WHERE id = $1`,
      [businessId]
    )
    return result.rows[0]?.config ?? {}
  }

  async getBySlug(slug: string): Promise<BusinessRecord | undefined> {
    const result = await this.pool.query<{ id: string; slug: string; name: string; status: BusinessRecord['status'] }>(
      `SELECT id, slug, name, status FROM businesses WHERE slug = $1`,
      [slug]
    )
    return result.rows[0]
  }
}

export function createPostgresBusinessStore(): BusinessStore {
  return new PostgresBusinessStore()
}
