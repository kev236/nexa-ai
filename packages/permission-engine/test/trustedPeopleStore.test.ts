import { describe, expect, it } from 'vitest'
import { InMemoryTrustedPeopleStore } from '../src/trustedPeople/memoryStore.js'
import { MAX_FAILED_ATTEMPTS } from '../src/trustedPeople/store.js'

describe('InMemoryTrustedPeopleStore', () => {
  it('never stores the plaintext PIN', async () => {
    const store = new InMemoryTrustedPeopleStore()
    const record = await store.add('Mom', '4821', 'owner_1')
    expect(record.pinHash).not.toBe('4821')
    expect(record.pinHash).not.toContain('4821')
  })

  it('verifies a correct name + PIN and rejects a wrong one', async () => {
    const store = new InMemoryTrustedPeopleStore()
    await store.add('Alex', '9042', 'owner_1')

    const ok = await store.verify('Alex', '9042')
    expect(ok?.name).toBe('Alex')

    const wrongPin = await store.verify('Alex', '0000')
    expect(wrongPin).toBeUndefined()

    const wrongName = await store.verify('Nobody', '9042')
    expect(wrongName).toBeUndefined()
  })

  it('is case-insensitive on name but not on the PIN', async () => {
    const store = new InMemoryTrustedPeopleStore()
    await store.add('Alex', '9042', 'owner_1')
    expect(await store.verify('ALEX', '9042')).toBeDefined()
    expect(await store.verify('alex', '9042')).toBeDefined()
  })

  it('records lastUsedAt only on a successful verify', async () => {
    const store = new InMemoryTrustedPeopleStore()
    const record = await store.add('Alex', '9042', 'owner_1')
    expect(record.lastUsedAt).toBeUndefined()

    await store.verify('Alex', '0000') // wrong PIN
    expect((await store.listAll())[0]?.lastUsedAt).toBeUndefined()

    await store.verify('Alex', '9042') // correct
    expect((await store.listAll())[0]?.lastUsedAt).toBeDefined()
  })

  it('denies a revoked person even with the correct PIN', async () => {
    const store = new InMemoryTrustedPeopleStore()
    const record = await store.add('Alex', '9042', 'owner_1')
    await store.revoke(record.id)

    expect(await store.verify('Alex', '9042')).toBeUndefined()
    expect((await store.listAll())[0]?.revokedAt).toBeDefined()
  })

  it('disambiguates two active people sharing the same name by PIN, not by insertion order', async () => {
    const store = new InMemoryTrustedPeopleStore()
    const first = await store.add('Alex', '1111', 'owner_1')
    const second = await store.add('Alex', '2222', 'owner_1')

    const matchedSecond = await store.verify('Alex', '2222')
    expect(matchedSecond?.id).toBe(second.id)

    const matchedFirst = await store.verify('Alex', '1111')
    expect(matchedFirst?.id).toBe(first.id)
  })

  it('revoking throws for an unknown id rather than silently no-oping', async () => {
    const store = new InMemoryTrustedPeopleStore()
    await expect(store.revoke('not-a-real-id')).rejects.toThrow(/no such trusted person/)
  })

  it('lists newest-first', async () => {
    const store = new InMemoryTrustedPeopleStore()
    await store.add('First', '1111', 'owner_1')
    await store.add('Second', '2222', 'owner_1')
    const all = await store.listAll()
    expect(all.map((r) => r.name)).toEqual(['Second', 'First'])
  })

  it('locks out after MAX_FAILED_ATTEMPTS wrong PINs, even against the real PIN', async () => {
    const store = new InMemoryTrustedPeopleStore()
    await store.add('Alex', '9042', 'owner_1')

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      expect(await store.verify('Alex', '0000')).toBeUndefined()
    }

    const record = (await store.listAll())[0]
    expect(record?.lockedUntil).toBeDefined()

    // Locked out now — even the correct PIN is refused until the lock expires.
    expect(await store.verify('Alex', '9042')).toBeUndefined()
  })

  it('locks out every candidate sharing a guessed-against name together, by design', async () => {
    // The name is the shared login identifier here, same as a username
    // on a real login form — a lockout scoped to it, not to whichever
    // individual record happens to sit behind it, is the intended
    // model: it's what stops "guess a common name's PIN" from being
    // unlimited just because two people happen to share that name.
    const store = new InMemoryTrustedPeopleStore()
    await store.add('Alex', '1111', 'owner_1')
    await store.add('Alex', '2222', 'owner_1')

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await store.verify('Alex', '0000') // wrong for both candidates, every round
    }

    expect(await store.verify('Alex', '1111')).toBeUndefined()
    expect(await store.verify('Alex', '2222')).toBeUndefined()
  })

  it('does not lock out an unrelated, differently-named person', async () => {
    const store = new InMemoryTrustedPeopleStore()
    await store.add('Alex', '1111', 'owner_1')
    await store.add('Sam', '2222', 'owner_1')

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await store.verify('Alex', '0000')
    }

    expect(await store.verify('Alex', '1111')).toBeUndefined() // Alex is locked
    expect(await store.verify('Sam', '2222')).toBeDefined() // Sam was never touched
  })

  it('resets failedAttempts to zero after a successful verify', async () => {
    const store = new InMemoryTrustedPeopleStore()
    await store.add('Alex', '9042', 'owner_1')

    await store.verify('Alex', '0000')
    await store.verify('Alex', '0000')
    await store.verify('Alex', '9042') // correct — should clear the count

    const record = (await store.listAll())[0]
    expect(record?.failedAttempts).toBe(0)
    expect(record?.lockedUntil).toBeUndefined()
  })
})
