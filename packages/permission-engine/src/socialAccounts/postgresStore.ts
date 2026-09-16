import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { Platform, SocialAccountRecord, SocialAccountStore } from './store.js'

type Row = {
  id: string
  business_id: string
  platform: Platform
  handle: string | null
  follower_count: number
  created_at: string
  updated_at: string
}

function toRecord(row: Row): SocialAccountRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    platform: row.platform,
    handle: row.handle ?? undefined,
    followerCount: row.follower_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PostgresSocialAccountStore implements SocialAccountStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async setFollowerCount(
    businessId: string,
    platform: Platform,
    followerCount: number,
    handle?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO social_accounts (business_id, platform, handle, follower_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (business_id, platform)
       DO UPDATE SET
         follower_count = EXCLUDED.follower_count,
         handle = COALESCE(EXCLUDED.handle, social_accounts.handle),
         updated_at = now()`,
      [businessId, platform, handle ?? null, followerCount]
    )
  }

  async listByBusiness(businessId: string): Promise<SocialAccountRecord[]> {
    const result = await this.pool.query<Row>('SELECT * FROM social_accounts WHERE business_id = $1', [businessId])
    return result.rows.map(toRecord)
  }
}

export function createPostgresSocialAccountStore(): SocialAccountStore {
  return new PostgresSocialAccountStore()
}
