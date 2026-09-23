import { describe, expect, it } from 'vitest'
import { InMemoryApiKeyStore } from '../src/apiKeys/memoryStore.js'

describe('InMemoryApiKeyStore', () => {
  it('creates a key and returns the plaintext exactly once', async () => {
    const store = new InMemoryApiKeyStore()
    const { record, plaintextKey } = await store.create('Acme Creators')

    expect(plaintextKey).toMatch(/^nexa_live_/)
    expect(record.name).toBe('Acme Creators')
    expect(record.keyHash).not.toBe(plaintextKey)
    expect(record.requestCount).toBe(0)
    expect(record.revokedAt).toBeUndefined()
  })

  it('finds an active key by its plaintext value', async () => {
    const store = new InMemoryApiKeyStore()
    const { plaintextKey } = await store.create('Acme Creators')

    const found = await store.findActiveByPlaintextKey(plaintextKey)
    expect(found?.name).toBe('Acme Creators')
  })

  it('rejects an unknown key', async () => {
    const store = new InMemoryApiKeyStore()
    await store.create('Acme Creators')

    const found = await store.findActiveByPlaintextKey('nexa_live_not_a_real_key')
    expect(found).toBeUndefined()
  })

  it('a revoked key no longer authenticates, even with the correct plaintext', async () => {
    const store = new InMemoryApiKeyStore()
    const { record, plaintextKey } = await store.create('Acme Creators')

    await store.revoke(record.id)

    const found = await store.findActiveByPlaintextKey(plaintextKey)
    expect(found).toBeUndefined()
  })

  it('records usage — increments the count and sets lastUsedAt', async () => {
    const store = new InMemoryApiKeyStore()
    const { record } = await store.create('Acme Creators')

    await store.recordUsage(record.id)
    await store.recordUsage(record.id)

    const [updated] = await store.listAll()
    expect(updated?.requestCount).toBe(2)
    expect(updated?.lastUsedAt).toBeDefined()
  })

  it('revoke throws for an unknown id', async () => {
    const store = new InMemoryApiKeyStore()
    await expect(store.revoke('nope')).rejects.toThrow(/no such API key/)
  })

  it('recordUsage throws for an unknown id', async () => {
    const store = new InMemoryApiKeyStore()
    await expect(store.recordUsage('nope')).rejects.toThrow(/no such API key/)
  })

  it('listAll returns newest first', async () => {
    const store = new InMemoryApiKeyStore()
    await store.create('First')
    await store.create('Second')

    const keys = await store.listAll()
    expect(keys.map((k) => k.name)).toEqual(['Second', 'First'])
  })
})
