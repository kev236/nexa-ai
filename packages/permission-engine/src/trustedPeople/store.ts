export type TrustedPersonRecord = {
  id: string
  name: string
  pinHash: string
  addedByOwnerId: string
  createdAt: string
  lastUsedAt?: string
  revokedAt?: string
  failedAttempts: number
  lockedUntil?: string
}

/** After this many wrong PINs in a row, a record locks out for LOCKOUT_DURATION_MS regardless of the next attempt's PIN. */
export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000

export interface TrustedPeopleStore {
  /** The owner enrolling someone — pin is the plaintext PIN they're choosing/relaying, hashed internally before it's ever stored. */
  add(name: string, pin: string, addedByOwnerId: string): Promise<TrustedPersonRecord>
  listAll(): Promise<TrustedPersonRecord[]>
  revoke(id: string): Promise<void>
  /**
   * A claimed name + PIN, checked against every active (non-revoked),
   * not-currently-locked-out record with a matching name — more than
   * one could share a display name, so this doesn't stop at the first
   * match, it tries each until one's PIN actually verifies. Records
   * lastUsedAt and resets failedAttempts on success; increments
   * failedAttempts (and locks out at MAX_FAILED_ATTEMPTS) on a wrong
   * PIN for a candidate. See this table's migration for why the lockout
   * has to be tracked here rather than in server memory.
   */
  verify(name: string, pin: string): Promise<TrustedPersonRecord | undefined>
}
