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
  exchangeCode(clientKey: string, clientSecret: string, code: string, redirectUri: string): Promise<TikTokTokenResult>
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
 * TikTok's own token-management endpoints only — NOT the "redirect the
 * owner to TikTok's consent screen" authorize URL, and not the Content
 * Posting API's upload endpoint. Both of those need TikTok's own docs
 * (the authorize endpoint and, more importantly, the exact scope names
 * TikTok expects for video posting) confirmed before writing code
 * against them — not guessed from training data, which is exactly how
 * this project's own README describes the risk that shelved the
 * original clip-reposting business once already (see step 19/23's
 * history): treat an unverified external API shape as untrustworthy
 * until confirmed, same as untrusted input. This file implements
 * precisely what was verified (the owner's own pasted API reference for
 * /oauth/token/ and /oauth/revoke/), nothing beyond it.
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
    exchangeCode(clientKey, clientSecret, code, redirectUri) {
      return tokenRequest({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
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
