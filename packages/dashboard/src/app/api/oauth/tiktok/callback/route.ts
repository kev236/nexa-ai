import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { createTikTokOAuthHttpClient } from '@nexa-ai/permission-engine'
import { TIKTOK_OAUTH_STATE_COOKIE_NAME, TIKTOK_OAUTH_VERIFIER_COOKIE_NAME } from '@/lib/tiktokOAuth'

/**
 * Step 29: the redirect target TikTok sends the owner back to — same
 * shape as api/oauth/youtube/callback/route.ts, plus reading back the
 * PKCE code_verifier start/route.ts stashed alongside the CSRF state.
 */
export async function GET(request: NextRequest) {
  await verifySession()

  const params = request.nextUrl.searchParams
  const error = params.get('error')
  if (error) {
    return NextResponse.json({ error: `TikTok authorization was not granted: ${error}` }, { status: 400 })
  }

  const code = params.get('code')
  const returnedState = params.get('state')
  if (!code || !returnedState) {
    return NextResponse.json({ error: 'Missing code or state in the OAuth callback' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(TIKTOK_OAUTH_STATE_COOKIE_NAME)?.value
  const codeVerifier = cookieStore.get(TIKTOK_OAUTH_VERIFIER_COOKIE_NAME)?.value
  cookieStore.delete(TIKTOK_OAUTH_STATE_COOKIE_NAME)
  cookieStore.delete(TIKTOK_OAUTH_VERIFIER_COOKIE_NAME)

  if (!expectedState || returnedState !== expectedState) {
    return NextResponse.json({ error: 'OAuth state mismatch — possible CSRF, or the flow expired. Try again.' }, { status: 400 })
  }
  if (!codeVerifier) {
    return NextResponse.json({ error: 'Missing PKCE verifier — the flow expired. Try again.' }, { status: 400 })
  }
  const businessSlug = expectedState.split('.')[1] || 'trendrush'

  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  const redirectUri = process.env.TIKTOK_OAUTH_REDIRECT_URI
  if (!clientKey || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_OAUTH_REDIRECT_URI must be set' },
      { status: 500 }
    )
  }

  try {
    const oauthClient = createTikTokOAuthHttpClient()
    const tokens = await oauthClient.exchangeCode(clientKey, clientSecret, code, redirectUri, codeVerifier)

    const business = await getBusiness(businessSlug)
    const engine = getEngine()
    await engine.oauthCredentialStore.save(business.id, 'tiktok', {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      externalAccountId: tokens.openId,
    })
  } catch (err) {
    console.error('TikTok OAuth token exchange failed:', err)
    return NextResponse.json(
      { error: `Token exchange failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    )
  }

  return NextResponse.redirect(new URL('/growth?tiktok_connected=1', request.url))
}
