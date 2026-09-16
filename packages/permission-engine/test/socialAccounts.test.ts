import { describe, expect, it } from 'vitest'
import { InMemorySocialAccountStore } from '../src/socialAccounts/memoryStore.js'

describe('InMemorySocialAccountStore', () => {
  it('creates a row per platform and lists them for a business', async () => {
    const store = new InMemorySocialAccountStore()
    await store.setFollowerCount('biz_1', 'youtube', 50)
    await store.setFollowerCount('biz_1', 'instagram', 30, 'trendrush.clips')

    const list = await store.listByBusiness('biz_1')
    expect(list).toHaveLength(2)
    expect(list.find((a) => a.platform === 'youtube')?.followerCount).toBe(50)
    expect(list.find((a) => a.platform === 'instagram')?.handle).toBe('trendrush.clips')
  })

  it('upserts by (business, platform) instead of adding a second row', async () => {
    const store = new InMemorySocialAccountStore()
    await store.setFollowerCount('biz_1', 'tiktok', 40, 'trendrush.clips')
    await store.setFollowerCount('biz_1', 'tiktok', 210)

    const list = await store.listByBusiness('biz_1')
    expect(list).toHaveLength(1)
    expect(list[0]?.followerCount).toBe(210)
    expect(list[0]?.handle).toBe('trendrush.clips') // an omitted handle keeps the existing one
  })

  it('scopes accounts per business', async () => {
    const store = new InMemorySocialAccountStore()
    await store.setFollowerCount('biz_1', 'youtube', 50)
    await store.setFollowerCount('biz_2', 'youtube', 999)

    const list = await store.listByBusiness('biz_1')
    expect(list).toHaveLength(1)
    expect(list[0]?.followerCount).toBe(50)
  })
})
