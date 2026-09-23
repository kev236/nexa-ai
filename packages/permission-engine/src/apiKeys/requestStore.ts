export type ApiKeyRequestRecord = {
  id: string
  email: string
  useCase: string
  createdAt: string
  fulfilledAt?: string
}

/**
 * Step 31: the public /clip-api landing page's "request access" inbox —
 * separate from ApiKeyStore itself (store.ts) because a request isn't a
 * key: most requests never become one (spam, tire-kickers, someone the
 * owner decides not to sell to), and a request carries fields
 * (email, use case) a key has no reason to keep once issued.
 */
export interface ApiKeyRequestStore {
  create(email: string, useCase: string): Promise<ApiKeyRequestRecord>
  listPending(): Promise<ApiKeyRequestRecord[]>
  markFulfilled(id: string): Promise<void>
}
