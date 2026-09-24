import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { readSession, signSessionToken, sessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/session'

// Optimistic check only — see docs/plan-001-foundations.md and the
// Next.js auth guide. The real check is verifySession() in src/lib/dal.ts,
// called from every page and Server Action; this just avoids an obvious
// round-trip to /login or back for the common case.
//
// /api/cron and /api/webhooks routes are excluded below (matcher, not
// here) rather than just letting them fall through this same logic —
// they authenticate with CRON_SECRET or a payload signature (see
// src/app/api/cron/poll/route.ts and .../api/webhooks/sanity/route.ts),
// never a session cookie, so this owner-session gate has nothing to
// check for them and would otherwise redirect every such request to
// /login before the route's own auth even runs — exactly the bug this
// already caused once for /api/cron/poll, caught by actually running it.
export async function proxy(request: NextRequest) {
  const session = await readSession()
  const isLoginPage = request.nextUrl.pathname === '/login'
  // /talk is the trusted-person entry point (Q2) — it has its own,
  // separate PIN-based auth (see trustedPersonSession.ts) and is never
  // gated by the owner's session, or a trusted friend/family member would
  // get bounced to the owner's /login before even reaching the PIN form.
  const isTalkRoute = request.nextUrl.pathname === '/talk' || request.nextUrl.pathname.startsWith('/talk/')

  if (!session && !isLoginPage && !isTalkRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const response = NextResponse.next()
  if (session) {
    // Sliding-window refresh: every authenticated visit re-signs the
    // cookie for another full SESSION_DURATION_MS (session.ts), so a
    // device the owner keeps using never actually reaches that ceiling —
    // this is what turns login into "remember this device" rather than a
    // fixed-length session, without ever disabling auth itself.
    const { token, expires } = await signSessionToken(session.ownerId)
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expires))
  }
  return response
}

export const config = {
  matcher: [
    '/((?!api/cron|api/webhooks|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|pwa-icon).*)',
  ],
}
