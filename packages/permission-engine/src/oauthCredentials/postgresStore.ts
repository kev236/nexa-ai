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
  external_account_id: string | null
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
    externalAccountId: row.external_account_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PostgresOAuthCredentialStore implements OAuthCredentialStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async save(
    businessId: string,
    platform: OAuthPlatform,
    tokens: { accessToken: string; refreshToken?: string; expiresAt: string; scope: string; externalAccountId?: string }
  ): Promise<void> {
    // refresh_token is NOT NULL, not NOT-EMPTY — the upsert's own
    // COALESCE(NULLIF(...), ...) below correctly falls back to the
    // existing row's token on a re-authorization, but says nothing
    // about a genuine first-time authorization that arrives with no
    // refresh token at all (Google omitting it despite prompt=consent,
    // or a bug upstream). Without this check that case would silently
    // insert an empty string — satisfies NOT NULL, produces no error,
    // and leaves a permanently broken credential no one finds out about
    // until the next upload fails a token refresh against an empty
    // string. InMemoryOAuthCredentialStore already throws on exactly
    // this case; this brings the store actually used in production to
    // the same "fail loudly" standard instead of a silent one.
    if (!tokens.refreshToken) {
      const existing = await this.get(businessId, platform)
      if (!existing) {
        throw new Error(`no refresh token available for a first-time ${platform} authorization`)
      }
    }
    await this.pool.query(
      `INSERT INTO oauth_credentials (business_id, platform, access_token, refresh_token, expires_at, scope, external_account_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
       ON CONFLICT (business_id, platform)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(NULLIF(EXCLUDED.refresh_token, ''), oauth_credentials.refresh_token),
         expires_at = EXCLUDED.expires_at,
         scope = EXCLUDED.scope,
         external_account_id = COALESCE(EXCLUDED.external_account_id, oauth_credentials.external_account_id),
         updated_at = now()`,
      [businessId, platform, tokens.accessToken, tokens.refreshToken ?? '', tokens.expiresAt, tokens.scope, tokens.externalAccountId ?? null]
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
