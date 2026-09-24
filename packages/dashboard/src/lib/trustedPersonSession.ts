import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

export const TRUSTED_PERSON_SESSION_COOKIE_NAME = 'trusted_person_session'

// 24 hours — deliberately much shorter than the owner's ~400-day session
// (see session.ts). A trusted person is recognized by a PIN they hold, not
// logged in with their own credentials; re-asking for it roughly daily
// keeps a lost or shared device from staying "recognized" indefinitely.
const TRUSTED_PERSON_SESSION_DURATION_MS = 24 * 60 * 60 * 1000

function encodedKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error(
      'SESSION_SECRET is not set. Generate one with `openssl rand -base64 32` and set it in .env / your deploy environment.'
    )
  }
  return new TextEncoder().encode(secret)
}

type TrustedPersonSessionPayload = {
  trustedPersonId: string
  name: string
  expiresAt: number
}

async function encrypt(payload: TrustedPersonSessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(payload.expiresAt / 1000))
    .sign(encodedKey())
}

async function decrypt(token: string | undefined): Promise<TrustedPersonSessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, encodedKey(), { algorithms: ['HS256'] })
    if (
      typeof payload.trustedPersonId !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.expiresAt !== 'number'
    ) {
      return null
    }
    return { trustedPersonId: payload.trustedPersonId, name: payload.name, expiresAt: payload.expiresAt }
  } catch {
    return null
  }
}

export async function createTrustedPersonSession(trustedPersonId: string, name: string): Promise<void> {
  const expiresAt = Date.now() + TRUSTED_PERSON_SESSION_DURATION_MS
  const token = await encrypt({ trustedPersonId, name, expiresAt })
  const cookieStore = await cookies()
  cookieStore.set(TRUSTED_PERSON_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  })
}

export async function readTrustedPersonSession(): Promise<TrustedPersonSessionPayload | null> {
  const cookieStore = await cookies()
  return decrypt(cookieStore.get(TRUSTED_PERSON_SESSION_COOKIE_NAME)?.value)
}

export async function deleteTrustedPersonSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(TRUSTED_PERSON_SESSION_COOKIE_NAME)
}
