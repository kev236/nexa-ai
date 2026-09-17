import { describe, expect, it } from 'vitest'
import { InMemoryOAuthCredentialStore } from '../src/oauthCredentials/memoryStore.js'

describe('InMemoryOAuthCredentialStore', () => {
  it('saves and retrieves a credential', async () => {
    const store = new InMemoryOAuthCredentialStore()
    await store.save('biz_1', 'youtube', {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2026-01-01T00:00:00Z',
      scope: 'youtube.upload',
    })

    const record = await store.get('biz_1', 'youtube')
    expect(record?.accessToken).toBe('access-1')
    expect(record?.refreshToken).toBe('refresh-1')
  })

  it('upserts by (business, platform), keeping the existing refresh token when a re-save omits one', async () => {
    const store = new InMemoryOAuthCredentialStore()
    await store.save('biz_1', 'youtube', {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2026-01-01T00:00:00Z',
      scope: 'youtube.upload',
    })
    await store.save('biz_1', 'youtube', {
      accessToken: 'access-2',
      expiresAt: '2026-01-01T01:00:00Z',
      scope: 'youtube.upload',
    })

    const record = await store.get('biz_1', 'youtube')
    expect(record?.accessToken).toBe('access-2')
    expect(record?.refreshToken).toBe('refresh-1')
  })

  it('throws if a first-time save has no refresh token', async () => {
    const store = new InMemoryOAuthCredentialStore()
    await expect(
      store.save('biz_1', 'youtube', {
        accessToken: 'access-1',
        expiresAt: '2026-01-01T00:00:00Z',
        scope: 'youtube.upload',
      })
    ).rejects.toThrow(/no refresh token/i)
  })

  it('scopes credentials per business and platform', async () => {
    const store = new InMemoryOAuthCredentialStore()
    await store.save('biz_1', 'youtube', {
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: '2026-01-01T00:00:00Z',
      scope: 's',
    })

    expect(await store.get('biz_2', 'youtube')).toBeUndefined()
    expect(await store.get('biz_1', 'tiktok')).toBeUndefined()
  })
})
