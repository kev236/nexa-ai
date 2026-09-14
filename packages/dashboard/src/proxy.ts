import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { readSession } from '@/lib/session'

// Optimistic check only — see docs/plan-001-foundations.md and the
// Next.js auth guide. The real check is verifySession() in src/lib/dal.ts,
// called from every page and Server Action; this just avoids an obvious
// round-trip to /login or back for the common case.
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
