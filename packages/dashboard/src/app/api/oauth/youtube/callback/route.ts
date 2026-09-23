import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { YOUTUBE_OAUTH_STATE_COOKIE_NAME } from '@/lib/youtubeOAuth'

type GoogleTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
  error?: string
  error_description?: string
}

/**
 * Step 25: the redirect target Google sends the owner back to after
 * they approve (or deny) the consent screen. Exchanges the one-time
 * `code` for real tokens and stores them — see start/route.ts for the
 * rest of this flow's design notes.
 */
export async function GET(request: NextRequest) {
  await verifySession()

  const params = request.nextUrl.searchParams
  const error = params.get('error')
  if (error) {
    return NextResponse.json({ error: `YouTube authorization was not granted: ${error}` }, { status: 400 })
  }

  const code = params.get('code')
  const returnedState = params.get('state')
  if (!code || !returnedState) {
    return NextResponse.json({ error: 'Missing code or state in the OAuth callback' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(YOUTUBE_OAUTH_STATE_COOKIE_NAME)?.value
  cookieStore.delete(YOUTUBE_OAUTH_STATE_COOKIE_NAME)

  if (!expectedState || returnedState !== expectedState) {
    return NextResponse.json({ error: 'OAuth state mismatch — possible CSRF, or the flow expired. Try again.' }, { status: 400 })
  }
  const businessSlug = expectedState.split('.')[1] || 'trendrush'

  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET, and YOUTUBE_OAUTH_REDIRECT_URI must be set' },
      { status: 500 }
    )
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = (await tokenResponse.json()) as GoogleTokenResponse
  if (!tokenResponse.ok || tokens.error) {
    console.error('YouTube OAuth token exchange failed:', tokens.error, tokens.error_description)
    return NextResponse.json(
      { error: `Token exchange failed: ${tokens.error ?? tokenResponse.status} ${tokens.error_description ?? ''}`.trim() },
      { status: 502 }
    )
  }

  const business = await getBusiness(businessSlug)
  const engine = getEngine()
  await engine.oauthCredentialStore.save(business.id, 'youtube', {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope,
  })

  return NextResponse.redirect(new URL('/growth?youtube_connected=1', request.url))
}
