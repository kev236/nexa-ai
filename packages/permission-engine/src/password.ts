import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

/**
 * scrypt via Node's built-in crypto — no external dependency for
 * something this scale doesn't need a library for. `db/createOwner.mjs`
 * duplicates this (it's plain JS run outside the TS build, not an import
 * of this file) — keep the two in sync if this ever changes.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEY_LENGTH)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, saltHex, hashHex] = parts as [string, string, string]
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const candidate = scryptSync(password, salt, KEY_LENGTH)
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}
