import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { TIKTOK_ADS_OAUTH_STATE_COOKIE_NAME } from '@/lib/tiktokAdsOAuth'

/**
 * Kicks off TikTok's Marketing API OAuth consent flow — a different app
 * and portal from api/oauth/tiktok/start's Content Posting flow (see
 * tiktokAdsAdapter.ts's own comment on what's unverified here).
 */
export async function GET(request: NextRequest) {
  await verifySession()

  const appId = process.env.TIKTOK_ADS_APP_ID
  const redirectUri = process.env.TIKTOK_ADS_OAUTH_REDIRECT_URI
  if (!appId || !redirectUri) {
    return NextResponse.json({ error: 'TIKTOK_ADS_APP_ID and TIKTOK_ADS_OAUTH_REDIRECT_URI must be set' }, { status: 500 })
  }

  const business = request.nextUrl.searchParams.get('business') ?? 'dropshipping'
  const state = `${randomUUID()}.${business}`

  const cookieStore = await cookies()
  cookieStore.set(TIKTOK_ADS_OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  // Path and param names sourced from cross-checked third-party 2026
  // integration guides, not business-api.tiktok.com directly (blocked by
  // this sandbox's network egress) — see tiktokAdsAdapter.ts's caveat.
  const authUrl = new URL('https://business-api.tiktok.com/portal/auth')
  authUrl.searchParams.set('app_id', appId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', state)

  return NextResponse.redirect(authUrl)
}
