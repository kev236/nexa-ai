import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { OAuthCredentialRecord, OAuthCredentialStore, OAuthPlatform } from './store.js'

type Row = {
  id: string
  business_id: string
  platform: OAuthPlatform
  access_token: string
  refresh_token: string
  expires_at: string
  scope: string
  created_at: string
  updated_at: string
}

function toRecord(row: Row): OAuthCredentialRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    platform: row.platform,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    scope: row.scope,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PostgresOAuthCredentialStore implements OAuthCredentialStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async save(
    businessId: string,
    platform: OAuthPlatform,
    tokens: { accessToken: string; refreshToken?: string; expiresAt: string; scope: string }
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO oauth_credentials (business_id, platform, access_token, refresh_token, expires_at, scope, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       ON CONFLICT (business_id, platform)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(NULLIF(EXCLUDED.refresh_token, ''), oauth_credentials.refresh_token),
         expires_at = EXCLUDED.expires_at,
         scope = EXCLUDED.scope,
         updated_at = now()`,
      [businessId, platform, tokens.accessToken, tokens.refreshToken ?? '', tokens.expiresAt, tokens.scope]
    )
  }

  async get(businessId: string, platform: OAuthPlatform): Promise<OAuthCredentialRecord | undefined> {
    const result = await this.pool.query<Row>(
      'SELECT * FROM oauth_credentials WHERE business_id = $1 AND platform = $2',
      [businessId, platform]
    )
    return result.rows[0] ? toRecord(result.rows[0]) : undefined
  }
}

export function createPostgresOAuthCredentialStore(): OAuthCredentialStore {
  return new PostgresOAuthCredentialStore()
}
