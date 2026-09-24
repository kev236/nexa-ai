export type OAuthPlatform = 'youtube' | 'instagram' | 'tiktok' | 'tiktok_ads'

export type OAuthCredentialRecord = {
  id: string
  businessId: string
  platform: OAuthPlatform
  accessToken: string
  refreshToken: string
  expiresAt: string
  scope: string
  /**
   * Step 29: the platform's own id for the connected account, resolved
   * once at connect time — Instagram's publish flow needs its Business
   * Account id to build /{ig-user-id}/media, and TikTok's token
   * response carries an open_id worth keeping for the same reason.
   * YouTube needs neither (the access token alone identifies the
   * channel), so this stays undefined there. TikTok Ads (platform
   * 'tiktok_ads') reuses this same field for the connected advertiser_id
   * — every Marketing API call needs it, same reasoning as Instagram's
   * ig-user-id.
   */
  externalAccountId?: string
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
    tokens: { accessToken: string; refreshToken?: string; expiresAt: string; scope: string; externalAccountId?: string }
  ): Promise<void>
  get(businessId: string, platform: OAuthPlatform): Promise<OAuthCredentialRecord | undefined>
}
