export type ApiKeyRecord = {
  id: string
  name: string
  keyHash: string
  requestCount: number
  createdAt: string
  lastUsedAt?: string
  revokedAt?: string
}

/**
 * Step 30: the clip-scoring API product's key store. Deliberately not
 * business-scoped — see migration 0024's own comment. `create()`
 * returns the plaintext key exactly once; nothing after that ever sees
 * it again, same as any other API-key product.
 */
export interface ApiKeyStore {
  create(name: string): Promise<{ record: ApiKeyRecord; plaintextKey: string }>
  /** undefined for a revoked key too — a revoked key authenticates as "no such key," not as "found but blocked." */
  findActiveByPlaintextKey(plaintextKey: string): Promise<ApiKeyRecord | undefined>
  recordUsage(id: string): Promise<void>
  revoke(id: string): Promise<void>
  listAll(): Promise<ApiKeyRecord[]>
}
