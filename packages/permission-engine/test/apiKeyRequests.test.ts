import { describe, expect, it } from 'vitest'
import { InMemoryApiKeyRequestStore } from '../src/apiKeys/requestMemoryStore.js'

describe('InMemoryApiKeyRequestStore', () => {
  it('creates a request and lists it as pending', async () => {
    const store = new InMemoryApiKeyRequestStore()
    const record = await store.create('dev@example.com', 'Scoring clips before editing them')

    expect(record.email).toBe('dev@example.com')
    expect(record.fulfilledAt).toBeUndefined()

    const pending = await store.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(record.id)
  })

  it('marking a request fulfilled removes it from the pending list', async () => {
    const store = new InMemoryApiKeyRequestStore()
    const record = await store.create('dev@example.com', 'Testing')

    await store.markFulfilled(record.id)

    expect(await store.listPending()).toHaveLength(0)
  })

  it('markFulfilled throws for an unknown id', async () => {
    const store = new InMemoryApiKeyRequestStore()
    await expect(store.markFulfilled('nope')).rejects.toThrow(/no such API key request/)
  })

  it('listPending returns newest first', async () => {
    const store = new InMemoryApiKeyRequestStore()
    await store.create('first@example.com', 'a')
    await store.create('second@example.com', 'b')

    const pending = await store.listPending()
    expect(pending.map((r) => r.email)).toEqual(['second@example.com', 'first@example.com'])
  })
})
