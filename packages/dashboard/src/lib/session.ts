import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'session'
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000 // 12 hours — an owner approving spend, not a long-lived login

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

export async function createSession(ownerId: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_DURATION_MS
  const token = await encrypt({ ownerId, expiresAt })
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  })
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  return decrypt(cookieStore.get(COOKIE_NAME)?.value)
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
