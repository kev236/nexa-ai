// Shared between api/oauth/tiktok-ads/start and .../callback. No PKCE
// verifier cookie here unlike tiktokOAuth.ts's Content Posting flow —
// no source checked for the Marketing API's authorize flow mentioned
// PKCE, but that absence itself isn't confirmed against TikTok's own
// docs (blocked by this sandbox's network egress) — see
// tiktokAdsAdapter.ts's own caveat.
export const TIKTOK_ADS_OAUTH_STATE_COOKIE_NAME = 'tiktok_ads_oauth_state'
