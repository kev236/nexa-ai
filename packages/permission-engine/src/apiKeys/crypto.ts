import { randomBytes, createHash } from 'node:crypto'

const KEY_PREFIX = 'nexa_live_'

/**
 * 256 bits of real randomness — same reasoning as this file's own
 * `hash()` comment on why a fast hash is the right choice here, unlike
 * password.ts's deliberately slow scrypt for low-entropy human input.
 * The prefix is cosmetic (lets a leaked key be recognized as this
 * system's at a glance, same idea as Stripe's `sk_live_` convention),
 * not part of the secret.
 */
export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`
}

/**
 * Looked up via an indexed equality WHERE clause (postgresStore.ts),
 * not compared byte-by-byte in application code the way
 * password.ts's scrypt output is — a SHA-256 digest of a 256-bit
 * random value has no meaningfully exploitable timing surface at that
 * search-space size, so this skips the timing-safe-compare machinery
 * password.ts needs for its own, different reasons.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}
