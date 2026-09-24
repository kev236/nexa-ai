import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { createTikTokAdsOAuthHttpClient } from '@nexa-ai/permission-engine'
import { TIKTOK_ADS_OAUTH_STATE_COOKIE_NAME } from '@/lib/tiktokAdsOAuth'

/** The redirect target TikTok sends the owner back to — same shape as api/oauth/tiktok/callback/route.ts, no PKCE verifier to read back. */
export async function GET(request: NextRequest) {
  await verifySession()

  const params = request.nextUrl.searchParams
  const error = params.get('error')
  if (error) {
    return NextResponse.json({ error: `TikTok Ads authorization was not granted: ${error}` }, { status: 400 })
  }

  const authCode = params.get('auth_code') ?? params.get('code')
  const returnedState = params.get('state')
  if (!authCode || !returnedState) {
    return NextResponse.json({ error: 'Missing auth_code or state in the OAuth callback' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(TIKTOK_ADS_OAUTH_STATE_COOKIE_NAME)?.value
  cookieStore.delete(TIKTOK_ADS_OAUTH_STATE_COOKIE_NAME)

  if (!expectedState || returnedState !== expectedState) {
    return NextResponse.json({ error: 'OAuth state mismatch — possible CSRF, or the flow expired. Try again.' }, { status: 400 })
  }
  const businessSlug = expectedState.split('.')[1] || 'dropshipping'

  const appId = process.env.TIKTOK_ADS_APP_ID
  const appSecret = process.env.TIKTOK_ADS_APP_SECRET
  if (!appId || !appSecret) {
    return NextResponse.json({ error: 'TIKTOK_ADS_APP_ID and TIKTOK_ADS_APP_SECRET must be set' }, { status: 500 })
  }

  try {
    const oauthClient = createTikTokAdsOAuthHttpClient()
    const tokens = await oauthClient.exchangeCode(appId, appSecret, authCode)
    if (tokens.advertiserIds.length === 0) {
      return NextResponse.json({ error: 'TikTok authorized this app but returned no advertiser id — is an ad account linked to it?' }, { status: 502 })
    }

    const business = await getBusiness(businessSlug)
    const engine = getEngine()
    await engine.oauthCredentialStore.save(business.id, 'tiktok_ads', {
      accessToken: tokens.accessToken,
      // No distinct refresh token in any source checked for the Marketing
      // API — access tokens are documented as long-lived, not rotated the
      // way Content Posting's are. OAuthCredentialStore.save() requires a
      // truthy refreshToken on first connect regardless, so the access
      // token stands in for it here; needs confirming against a real
      // token-expiry test, not a claim that TikTok returns this field.
      refreshToken: tokens.accessToken,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      scope: tokens.scope,
      externalAccountId: tokens.advertiserIds[0],
    })
  } catch (err) {
    console.error('TikTok Ads OAuth token exchange failed:', err)
    return NextResponse.json(
      { error: `Token exchange failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    )
  }

  return NextResponse.redirect(new URL('/growth?tiktok_ads_connected=1', request.url))
}
