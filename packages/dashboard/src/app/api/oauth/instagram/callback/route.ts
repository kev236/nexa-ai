import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { createInstagramHttpClient } from '@nexa-ai/permission-engine'
import { INSTAGRAM_OAUTH_STATE_COOKIE_NAME } from '@/lib/instagramOAuth'

/**
 * Step 29: the redirect target Facebook sends the owner back to. Beyond
 * the token exchange api/oauth/youtube/callback/route.ts's shape
 * covers, this also: exchanges the short-lived token Facebook returns
 * for a long-lived one (~60 days), then calls /me/accounts to find
 * which connected Facebook Page has an Instagram Business Account
 * linked and stores *that* Page's own access token — not the user
 * token — since Instagram's publish endpoints are authorized against
 * the Page, not the person. The long-lived user token itself is kept
 * as the stored "refresh token" (see postClipInstagram.ts's own
 * comment on why) so it can be re-extended and re-derive a fresh Page
 * token later, rather than a real OAuth refresh_token, which this flow
 * doesn't have.
 */
export async function GET(request: NextRequest) {
  await verifySession()

  const params = request.nextUrl.searchParams
  const error = params.get('error')
  if (error) {
    return NextResponse.json({ error: `Instagram authorization was not granted: ${error}` }, { status: 400 })
  }

  const code = params.get('code')
  const returnedState = params.get('state')
  if (!code || !returnedState) {
    return NextResponse.json({ error: 'Missing code or state in the OAuth callback' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(INSTAGRAM_OAUTH_STATE_COOKIE_NAME)?.value
  cookieStore.delete(INSTAGRAM_OAUTH_STATE_COOKIE_NAME)

  if (!expectedState || returnedState !== expectedState) {
    return NextResponse.json({ error: 'OAuth state mismatch — possible CSRF, or the flow expired. Try again.' }, { status: 400 })
  }
  const businessSlug = expectedState.split('.')[1] || 'trendrush'

  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI
  if (!appId || !appSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and INSTAGRAM_OAUTH_REDIRECT_URI must be set' },
      { status: 500 }
    )
  }

  try {
    const client = createInstagramHttpClient()
    const shortLived = await client.exchangeCode(appId, appSecret, code, redirectUri)
    const longLived = await client.exchangeForLongLivedToken(appId, appSecret, shortLived.accessToken)
    const pages = await client.listConnectedPages(longLived.accessToken)
    const withInstagram = pages.find((p) => p.instagramBusinessAccountId)
    if (!withInstagram?.instagramBusinessAccountId) {
      return NextResponse.json(
        { error: 'No Facebook Page with a linked Instagram Professional account was found on this login. Link one in Meta Business Suite first.' },
        { status: 400 }
      )
    }

    const business = await getBusiness(businessSlug)
    const engine = getEngine()
    await engine.oauthCredentialStore.save(business.id, 'instagram', {
      accessToken: withInstagram.pageAccessToken,
      refreshToken: longLived.accessToken,
      expiresAt: longLived.expiresAt,
      scope: 'instagram_basic,instagram_content_publish',
      externalAccountId: withInstagram.instagramBusinessAccountId,
    })
  } catch (err) {
    console.error('Instagram OAuth token exchange failed:', err)
    return NextResponse.json(
      { error: `Token exchange failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    )
  }

  return NextResponse.redirect(new URL('/growth?instagram_connected=1', request.url))
}
