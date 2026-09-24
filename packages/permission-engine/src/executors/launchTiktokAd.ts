import type { JsonValue } from '../json.js'
import type { OAuthCredentialStore } from '../oauthCredentials/store.js'
import type { TikTokAdsClient } from '../adapters/tiktokAdsAdapter.js'
import { createTikTokAdsHttpClient } from '../adapters/tiktokAdsAdapter.js'
import { createPostgresOAuthCredentialStore } from '../oauthCredentials/postgresStore.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

type LaunchTiktokAdPayload = {
  tiktokItemId: string
  campaignName: string
  dailyBudgetCents: number
  currency: string
}

function assertPayload(payload: JsonValue): LaunchTiktokAdPayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new TypeError('launch_tiktok_ad payload must be an object')
  }
  const p = payload as Record<string, unknown>
  if (typeof p.tiktokItemId !== 'string' || !p.tiktokItemId) {
    throw new TypeError('launch_tiktok_ad payload missing tiktokItemId')
  }
  if (typeof p.campaignName !== 'string' || !p.campaignName) {
    throw new TypeError('launch_tiktok_ad payload missing campaignName')
  }
  if (typeof p.dailyBudgetCents !== 'number' || !Number.isInteger(p.dailyBudgetCents) || p.dailyBudgetCents <= 0) {
    throw new TypeError('launch_tiktok_ad payload dailyBudgetCents must be a positive integer')
  }
  if (typeof p.currency !== 'string' || !p.currency) {
    throw new TypeError('launch_tiktok_ad payload missing currency')
  }
  return { tiktokItemId: p.tiktokItemId, campaignName: p.campaignName, dailyBudgetCents: p.dailyBudgetCents, currency: p.currency }
}

/**
 * The first executor in this codebase that actually spends real money —
 * every request that reaches this must have gone through requestAction()
 * with expectedCost set (see dashboard's launchTiktokAdAction), which is
 * what routes it through the pending-approval queue instead of
 * auto-executing (engine.ts's shouldAutoApprove: expectedCost is the only
 * thing that isn't auto-approved). This function only ever runs after
 * the owner clicks Approve.
 *
 * See tiktokAdsAdapter.ts's own comment for what's unverified about the
 * actual TikTok Marketing API calls this makes.
 */
export function createLaunchTiktokAdExecutor(oauthCredentialStore: OAuthCredentialStore, adsClient: TikTokAdsClient): ExecutorFn {
  return async (payload, context) => {
    const input = assertPayload(payload)

    const credential = await oauthCredentialStore.get(context.businessId, 'tiktok_ads')
    if (!credential) {
      throw new Error(`business ${context.businessId} has no TikTok Ads credential — connect it from the Growth page first`)
    }
    if (!credential.externalAccountId) {
      throw new Error(`business ${context.businessId}'s TikTok Ads credential has no advertiser id`)
    }

    const result = await adsClient.createSparkAdsCampaign(credential.accessToken, {
      advertiserId: credential.externalAccountId,
      campaignName: input.campaignName,
      tiktokItemId: input.tiktokItemId,
      dailyBudgetCents: input.dailyBudgetCents,
      currency: input.currency,
    })

    return result
  }
}

export function registerLaunchTiktokAdExecutor(oauthCredentialStore?: OAuthCredentialStore): void {
  registerExecutor(
    'launch_tiktok_ad',
    createLaunchTiktokAdExecutor(oauthCredentialStore ?? createPostgresOAuthCredentialStore(), createTikTokAdsHttpClient())
  )
}
