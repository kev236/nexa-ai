export type Platform = 'youtube' | 'instagram' | 'tiktok'

export const PLATFORMS: readonly Platform[] = ['youtube', 'instagram', 'tiktok']

export type SocialAccountRecord = {
  id: string
  businessId: string
  platform: Platform
  handle?: string
  followerCount: number
  createdAt: string
  updatedAt: string
}

/**
 * Step 20: real follower counts, entered by hand from the dashboard's
 * Growth page — same "plain owner-authored data" reasoning as
 * OpportunityStore/CampaignStore, so no requestAction()/approvals here.
 */
export interface SocialAccountStore {
  /** Upserts by (businessId, platform) — one row per platform per business. */
  setFollowerCount(businessId: string, platform: Platform, followerCount: number, handle?: string): Promise<void>
  listByBusiness(businessId: string): Promise<SocialAccountRecord[]>
}
