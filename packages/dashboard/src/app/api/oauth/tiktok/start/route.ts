import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { TIKTOK_OAUTH_STATE_COOKIE_NAME, TIKTOK_OAUTH_VERIFIER_COOKIE_NAME } from '@/lib/tiktokOAuth'

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Step 29: kicks off TikTok's OAuth consent flow, mirroring
 * api/oauth/youtube/start/route.ts's shape with one addition — TikTok's
 * Content Posting API requires PKCE (see tiktokAdapter.ts's own
 * comment), so this generates a code_verifier, derives its S256
 * code_challenge, and stashes the verifier in a second short-lived
 * cookie alongside the CSRF state.
 *
 * Until the owner's TikTok API client passes TikTok's own audit,
 * anything posted through this connection is forced to SELF_ONLY
 * regardless of what's requested — same shape as YouTube's
 * verification-gated Private cap, enforced by TikTok server-side, not
 * something this flow can work around.
 */
export async function GET(request: NextRequest) {
  await verifySession()

  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const redirectUri = process.env.TIKTOK_OAUTH_REDIRECT_URI
  if (!clientKey || !redirectUri) {
    return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY and TIKTOK_OAUTH_REDIRECT_URI must be set' }, { status: 500 })
  }

  const business = request.nextUrl.searchParams.get('business') ?? 'trendrush'
  const state = `${randomUUID()}.${business}`
  const codeVerifier = base64url(randomBytes(32))
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())

  const cookieStore = await cookies()
  const cookieOpts = { httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge: 600, path: '/' }
  cookieStore.set(TIKTOK_OAUTH_STATE_COOKIE_NAME, state, cookieOpts)
  cookieStore.set(TIKTOK_OAUTH_VERIFIER_COOKIE_NAME, codeVerifier, cookieOpts)

  // Path and exact param names sourced from cross-checked third-party
  // 2026 integration guides, not developers.tiktok.com directly (blocked
  // by this sandbox's network egress) — see tiktokAdapter.ts's caveat.
  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/')
  authUrl.searchParams.set('client_key', clientKey)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'user.info.basic,video.publish,video.upload')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  return NextResponse.redirect(authUrl)
}
