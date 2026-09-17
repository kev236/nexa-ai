import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

export const SESSION_COOKIE_NAME = 'session'

// ~400 days — the longest a browser will actually retain a cookie
// (Chrome/Safari cap Expires that far out from when it's set). This
// dashboard has exactly one real user, the owner, so "log in once per
// device, then never again unless the device sits unused for over a
// year" is the intended tradeoff — not the old 12-hour approval-session
// window. proxy.ts re-signs this cookie for a fresh SESSION_DURATION_MS
// on every authenticated request, so an owner who keeps using a device
// never actually hits this ceiling; only genuine long-term inactivity does.
const SESSION_DURATION_MS = 400 * 24 * 60 * 60 * 1000

function encodedKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error(
      'SESSION_SECRET is not set. Generate one with `openssl rand -base64 32` and set it in .env / your deploy environment.'
    )
  }
  return new TextEncoder().encode(secret)
}

type SessionPayload = {
  ownerId: string
  expiresAt: number
}

async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(payload.expiresAt / 1000))
    .sign(encodedKey())
}

async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, encodedKey(), { algorithms: ['HS256'] })
    if (typeof payload.ownerId !== 'string' || typeof payload.expiresAt !== 'number') return null
    return { ownerId: payload.ownerId, expiresAt: payload.expiresAt }
  } catch {
    return null
  }
}

/** Signs a fresh session token for `ownerId`, SESSION_DURATION_MS out from now. Shared by login (createSession) and proxy.ts's rolling refresh, so both stamp the same cookie shape. */
export async function signSessionToken(ownerId: string): Promise<{ token: string; expires: Date }> {
  const expiresAt = Date.now() + SESSION_DURATION_MS
  return { token: await encrypt({ ownerId, expiresAt }), expires: new Date(expiresAt) }
}

export function sessionCookieOptions(expires: Date): {
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax'
  path: string
  expires: Date
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  }
}

export async function createSession(ownerId: string): Promise<void> {
  const { token, expires } = await signSessionToken(ownerId)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expires))
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  return decrypt(cookieStore.get(SESSION_COOKIE_NAME)?.value)
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}
