import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { INSTAGRAM_OAUTH_STATE_COOKIE_NAME } from '@/lib/instagramOAuth'

/**
 * Step 29: kicks off Facebook Login's OAuth consent flow for TrendRush's
 * Instagram publishing — same shape as api/oauth/youtube/start/route.ts.
 * Requires a Facebook Page linked to an Instagram Professional account;
 * the callback resolves which Page/IG account this grants access to,
 * this route only requests the permissions.
 *
 * pages_show_list + pages_read_engagement let the callback list the
 * owner's Pages and find the linked IG account; instagram_basic +
 * instagram_content_publish are what actually let this post. Real
 * production use needs Meta's App Review for instagram_content_publish
 * beyond the app's own registered testers — same shape as YouTube's own
 * verification gate, Meta's process rather than something this code can
 * shortcut. Scope names and the dialog path are sourced from
 * cross-checked third-party 2026 guides, not developers.facebook.com
 * directly (blocked by this sandbox's network egress) — see
 * instagramAdapter.ts's own comment.
 */
export async function GET(request: NextRequest) {
  await verifySession()

  const appId = process.env.INSTAGRAM_APP_ID
  const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI
  if (!appId || !redirectUri) {
    return NextResponse.json({ error: 'INSTAGRAM_APP_ID and INSTAGRAM_OAUTH_REDIRECT_URI must be set' }, { status: 500 })
  }

  const business = request.nextUrl.searchParams.get('business') ?? 'trendrush'
  const state = `${randomUUID()}.${business}`

  const cookieStore = await cookies()
  cookieStore.set(INSTAGRAM_OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const authUrl = new URL('https://www.facebook.com/v23.0/dialog/oauth')
  authUrl.searchParams.set('client_id', appId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish')
  authUrl.searchParams.set('state', state)

  return NextResponse.redirect(authUrl)
}
