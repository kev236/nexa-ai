export type TikTokTokenResult = {
  openId: string
  scope: string
  accessToken: string
  expiresAt: string
  refreshToken: string
  refreshExpiresAt: string
}

/** Only what this needs — keeps it unit-testable without a real TikTok client. */
export type TikTokOAuthClient = {
  /**
   * codeVerifier is required — TikTok's Content Posting API rejects an
   * authorize/token exchange that skips PKCE with error code 10007
   * (per third-party integration guides cross-checked at write time;
   * developers.tiktok.com itself is unreachable from this sandbox's
   * network egress, so this isn't confirmed against TikTok's own docs —
   * verify against the real flow on first use).
   */
  exchangeCode(
    clientKey: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<TikTokTokenResult>
  refreshAccessToken(clientKey: string, clientSecret: string, refreshToken: string): Promise<TikTokTokenResult>
  revokeToken(clientKey: string, clientSecret: string, accessToken: string): Promise<void>
}

const TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/'
const REVOKE_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/revoke/'

type TikTokTokenResponse = {
  open_id?: string
  scope?: string
  access_token?: string
  expires_in?: number
  refresh_token?: string
  refresh_expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

function toTokenResult(body: TikTokTokenResponse): TikTokTokenResult {
  const now = Date.now()
  return {
    openId: body.open_id ?? '',
    scope: body.scope ?? '',
    accessToken: body.access_token ?? '',
    expiresAt: new Date(now + (body.expires_in ?? 0) * 1000).toISOString(),
    refreshToken: body.refresh_token ?? '',
    refreshExpiresAt: new Date(now + (body.refresh_expires_in ?? 0) * 1000).toISOString(),
  }
}

/**
 * TikTok's own token-management endpoints, plus the authorize URL and
 * Content Posting API upload flow this file's own comment previously
 * said were missing (see tiktokUploadAdapter.ts) — this step went
 * ahead and built those, sourced from cross-checked third-party 2026
 * integration guides rather than TikTok's own docs, since
 * developers.tiktok.com is blocked by this sandbox's network egress
 * and couldn't be fetched directly. That's a real step down from this
 * file's original standard ("implements precisely what was verified...
 * nothing beyond it") — flagged loudly here and in README.md's step 29
 * entry, not glossed over. The owner should treat the exact scope
 * names, endpoint paths, and request/response field names below as
 * needing confirmation against the real docs (or a real test run)
 * before trusting them, the same as any other unverified external
 * dependency.
 */
export function createTikTokOAuthHttpClient(): TikTokOAuthClient {
  async function tokenRequest(params: Record<string, string>): Promise<TikTokTokenResult> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams(params),
    })
    const body = (await response.json().catch(() => ({}))) as TikTokTokenResponse
    if (!response.ok || body.error || !body.access_token) {
      throw new Error(`TikTok token request failed: HTTP ${response.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim())
    }
    return toTokenResult(body)
  }

  return {
    exchangeCode(clientKey, clientSecret, code, redirectUri, codeVerifier) {
      return tokenRequest({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      })
    },

    refreshAccessToken(clientKey, clientSecret, refreshToken) {
      return tokenRequest({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })
    },

    async revokeToken(clientKey, clientSecret, accessToken) {
      const response = await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
        body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, token: accessToken }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as TikTokTokenResponse
        throw new Error(`TikTok token revoke failed: HTTP ${response.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim())
      }
    },
  }
}
