import { describe, expect, it } from 'vitest'
import { createLaunchTiktokAdExecutor } from '../src/executors/launchTiktokAd.js'
import { InMemoryOAuthCredentialStore } from '../src/oauthCredentials/memoryStore.js'
import type { TikTokAdsClient } from '../src/adapters/tiktokAdsAdapter.js'

function fakeAdsClient(overrides: Partial<TikTokAdsClient> = {}): TikTokAdsClient {
  return {
    createSparkAdsCampaign: async () => ({ campaignId: 'camp_1', adGroupId: 'adgroup_1', adId: 'ad_1' }),
    ...overrides,
  }
}

const PAYLOAD = {
  tiktokItemId: 'item_123',
  campaignName: 'Phone Camera Lens Kits — launch',
  dailyBudgetCents: 1000,
  currency: 'EUR',
}

describe('launch_tiktok_ad executor', () => {
  it('launches a Spark Ads campaign using the stored advertiser credential', async () => {
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'tiktok_ads', {
      accessToken: 'at_1',
      refreshToken: 'n/a',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'campaign.manage',
      externalAccountId: 'advertiser_1',
    })

    let calledWith: unknown
    const executor = createLaunchTiktokAdExecutor(
      oauth,
      fakeAdsClient({
        createSparkAdsCampaign: async (accessToken, input) => {
          calledWith = { accessToken, input }
          return { campaignId: 'camp_1', adGroupId: 'adgroup_1', adId: 'ad_1' }
        },
      })
    )

    const result = await executor(PAYLOAD, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(result).toEqual({ campaignId: 'camp_1', adGroupId: 'adgroup_1', adId: 'ad_1' })
    expect(calledWith).toMatchObject({
      accessToken: 'at_1',
      input: { advertiserId: 'advertiser_1', tiktokItemId: 'item_123', dailyBudgetCents: 1000, currency: 'EUR' },
    })
  })

  it('throws when the business has no TikTok Ads credential', async () => {
    const executor = createLaunchTiktokAdExecutor(new InMemoryOAuthCredentialStore(), fakeAdsClient())

    await expect(executor(PAYLOAD, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(/no tiktok ads credential/i)
  })

  it('throws when the stored credential has no advertiser id', async () => {
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'tiktok_ads', {
      accessToken: 'at_1',
      refreshToken: 'n/a',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'campaign.manage',
    })
    const executor = createLaunchTiktokAdExecutor(oauth, fakeAdsClient())

    await expect(executor(PAYLOAD, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(/no advertiser id/i)
  })

  it('rejects a malformed payload', async () => {
    const executor = createLaunchTiktokAdExecutor(new InMemoryOAuthCredentialStore(), fakeAdsClient())
    await expect(executor({ tiktokItemId: 'x' }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(TypeError)
  })

  it('rejects a non-positive or non-integer daily budget', async () => {
    const executor = createLaunchTiktokAdExecutor(new InMemoryOAuthCredentialStore(), fakeAdsClient())
    await expect(executor({ ...PAYLOAD, dailyBudgetCents: 0 }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(TypeError)
    await expect(executor({ ...PAYLOAD, dailyBudgetCents: 10.5 }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(TypeError)
  })
})
