import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { YOUTUBE_OAUTH_STATE_COOKIE_NAME } from '@/lib/youtubeOAuth'

/**
 * Step 25 (TrendRush publish capability): kicks off the OAuth consent
 * flow for a business's YouTube channel. Scopes requested here need
 * Google's app verification before uploads can go public — see
 * AGENTS.md / the session notes for why that's not optional (apps that
 * haven't passed the compliance audit can only upload as Private).
 * While unverified, this still works end-to-end for the owner's own
 * account added as a test user — enough to prove the flow and produce
 * the demo material verification requires.
 *
 * GET so it can be a plain link from the dashboard, not a form.
 */
export async function GET(request: NextRequest) {
  await verifySession()

  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID
  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_REDIRECT_URI must be set' },
      { status: 500 }
    )
  }

  const business = request.nextUrl.searchParams.get('business') ?? 'trendrush'
  const state = `${randomUUID()}.${business}`

  const cookieStore = await cookies()
  cookieStore.set(YOUTUBE_OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes — only needs to survive the round trip to Google and back
    path: '/',
  })

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set(
    'scope',
    'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'
  )
  // offline -> issues a refresh_token, not just a short-lived access_token.
  // prompt=consent -> forces that issuance even on a repeat authorization
  // (Google only sends a refresh_token by default on the very first
  // consent for a given user+app), which matters here since re-running
  // this flow to fix a revoked/expired token needs a fresh one.
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  return NextResponse.redirect(authUrl)
}
