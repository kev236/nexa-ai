/**
 * TikTok's Marketing API (business-api.tiktok.com) — a completely
 * separate app, OAuth flow, and token type from tiktokAdapter.ts's
 * Content Posting API. Same "sourced from cross-checked third-party
 * 2026 guides, not TikTok's own docs" caveat as that file, for the same
 * reason: business-api.tiktok.com, developers.tiktok.com, and
 * ads.tiktok.com are all blocked by this sandbox's network egress, so
 * none of this was confirmed against TikTok's own reference. Treat every
 * endpoint path, field name, and enum value below as needing a real
 * test run (or a real docs check) before the first campaign that spends
 * real money — this is flagged loudly here and in README.md rather than
 * presented as verified.
 *
 * Scoped deliberately narrow: one method, createSparkAdsCampaign, that
 * boosts a video ALREADY posted organically on TikTok (Spark Ads) rather
 * than uploading new ad creative — this system has no video-rendering
 * pipeline for dropshipping yet (the Creative Agent only writes scripts/
 * captions), so "upload a fresh video ad" isn't a real option today.
 * Spark Ads authorizes an existing item_id instead.
 */

export type TikTokAdsTokenResult = {
  accessToken: string
  advertiserIds: string[]
  scope: string
}

/** Only what this needs — keeps it unit-testable without a real TikTok client. */
export type TikTokAdsOAuthClient = {
  exchangeCode(appId: string, appSecret: string, authCode: string): Promise<TikTokAdsTokenResult>
}

export type SparkAdsCampaignInput = {
  advertiserId: string
  campaignName: string
  /** The already-posted TikTok video's item id (Spark Ads boosts existing organic content, not a new upload). */
  tiktokItemId: string
  dailyBudgetCents: number
  currency: string
}

export type SparkAdsCampaignResult = {
  campaignId: string
  adGroupId: string
  adId: string
}

/** Only what this needs — keeps it unit-testable without a real TikTok client. */
export type TikTokAdsClient = {
  createSparkAdsCampaign(accessToken: string, input: SparkAdsCampaignInput): Promise<SparkAdsCampaignResult>
}

const BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3'

type TikTokAdsApiResponse<T> = {
  code: number
  message: string
  data?: T
}

async function callApi<T>(path: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Access-Token': accessToken },
    body: JSON.stringify(body),
  })
  const parsed = (await response.json().catch(() => ({}))) as TikTokAdsApiResponse<T>
  if (!response.ok || parsed.code !== 0 || !parsed.data) {
    throw new Error(`TikTok Marketing API request to ${path} failed: HTTP ${response.status} (code ${parsed.code}) ${parsed.message ?? ''}`.trim())
  }
  return parsed.data
}

/**
 * TikTok Ads OAuth's own token endpoint — distinct from Content
 * Posting's open.tiktokapis.com token endpoint. No PKCE in any source
 * checked (unlike the Content Posting flow, which requires it) — but
 * that absence itself needs confirming against the real flow, not
 * trusted as a hard fact.
 */
export function createTikTokAdsOAuthHttpClient(): TikTokAdsOAuthClient {
  return {
    async exchangeCode(appId, appSecret, authCode) {
      const response = await fetch(`${BASE_URL}/oauth2/access_token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, secret: appSecret, auth_code: authCode }),
      })
      const parsed = (await response.json().catch(() => ({}))) as TikTokAdsApiResponse<{
        access_token?: string
        advertiser_ids?: string[]
        scope?: string[]
      }>
      if (!response.ok || parsed.code !== 0 || !parsed.data?.access_token) {
        throw new Error(`TikTok Ads token exchange failed: HTTP ${response.status} (code ${parsed.code}) ${parsed.message ?? ''}`.trim())
      }
      return {
        accessToken: parsed.data.access_token,
        advertiserIds: parsed.data.advertiser_ids ?? [],
        scope: (parsed.data.scope ?? []).join(','),
      }
    },
  }
}

export function createTikTokAdsHttpClient(): TikTokAdsClient {
  return {
    async createSparkAdsCampaign(accessToken, input) {
      const campaign = await callApi<{ campaign_id: string }>('/campaign/create/', accessToken, {
        advertiser_id: input.advertiserId,
        campaign_name: input.campaignName,
        objective_type: 'ENGAGEMENT',
        budget_mode: 'BUDGET_MODE_DAY',
        budget: input.dailyBudgetCents / 100,
      })

      const adGroup = await callApi<{ adgroup_id: string }>('/adgroup/create/', accessToken, {
        advertiser_id: input.advertiserId,
        campaign_id: campaign.campaign_id,
        adgroup_name: `${input.campaignName} — ad group`,
        budget_mode: 'BUDGET_MODE_DAY',
        budget: input.dailyBudgetCents / 100,
        billing_event: 'OCPM',
        optimization_goal: 'ENGAGED_VIEW',
      })

      const ad = await callApi<{ ad_id: string }>('/ad/create/', accessToken, {
        advertiser_id: input.advertiserId,
        adgroup_id: adGroup.adgroup_id,
        creatives: [{ ad_format: 'SINGLE_VIDEO', identity_type: 'AUTH_CODE', tiktok_item_id: input.tiktokItemId }],
      })

      return { campaignId: campaign.campaign_id, adGroupId: adGroup.adgroup_id, adId: ad.ad_id }
    },
  }
}
