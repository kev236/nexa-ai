// Shared between api/oauth/tiktok/start and .../callback — same reasoning
// as youtubeOAuth.ts's identical file. Two cookies here instead of one:
// PKCE needs the code_verifier to survive the round trip to TikTok and
// back, same as the CSRF state does.
export const TIKTOK_OAUTH_STATE_COOKIE_NAME = 'tiktok_oauth_state'
export const TIKTOK_OAUTH_VERIFIER_COOKIE_NAME = 'tiktok_oauth_verifier'
