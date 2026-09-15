import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { readSession } from '@/lib/session'

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

  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/cron|api/webhooks|_next/static|_next/image|favicon.ico).*)'],
}
