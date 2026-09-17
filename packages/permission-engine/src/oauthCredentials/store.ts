export type OAuthPlatform = 'youtube' | 'instagram' | 'tiktok'

export type OAuthCredentialRecord = {
  id: string
  businessId: string
  platform: OAuthPlatform
  accessToken: string
  refreshToken: string
  expiresAt: string
  scope: string
  createdAt: string
  updatedAt: string
}

/**
 * Step 25 (TrendRush publish capability): the tokens from a platform's
 * OAuth consent flow — distinct from SocialAccountStore, which only
 * tracks public follower counts (no credentials, no write access).
 * A row here means the business can act on that platform account, not
 * just observe it.
 */
export interface OAuthCredentialStore {
  /**
   * Upserts by (businessId, platform) — one row per platform per business,
   * same shape as SocialAccountStore. refreshToken is optional because
   * Google only returns one on the very first consent (or when
   * `prompt=consent` forces it) — a re-authorization's response may omit
   * it, in which case the existing one is kept rather than cleared.
   */
  save(
    businessId: string,
    platform: OAuthPlatform,
    tokens: { accessToken: string; refreshToken?: string; expiresAt: string; scope: string }
  ): Promise<void>
  get(businessId: string, platform: OAuthPlatform): Promise<OAuthCredentialRecord | undefined>
}
