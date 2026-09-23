export type CampaignRecord = {
  id: string
  businessId: string
  externalId?: string
  product: string
  targetAudience?: string
  problem?: string
  benefits: string[]
  uniqueSellingPoints: string[]
  allowedClaims: string[]
  forbiddenClaims: string[]
  cta?: string
  landingPage?: string
  availableAssets: string[]
  rawInput?: string
  status: 'active' | 'paused' | 'archived'
  createdAt: string
  updatedAt: string
}

export type CampaignInput = {
  externalId?: string
  product: string
  targetAudience?: string
  problem?: string
  benefits?: string[]
  uniqueSellingPoints?: string[]
  allowedClaims?: string[]
  forbiddenClaims?: string[]
  cta?: string
  landingPage?: string
  availableAssets?: string[]
  rawInput?: string
}

/**
 * Step 16: no agent or executor writes here without a human-supplied
 * campaign in the first place — the Campaign Agent normalizes what a
 * human imported (manual entry or CSV), it never originates a campaign
 * on its own. Not routed through requestAction()/approvals: importing
 * campaign data isn't money-spending, customer-facing, or irreversible.
 */
export interface CampaignStore {
  /** Idempotent on (business_id, externalId) when externalId is set — inserted:false means it already existed and was left untouched, so a re-import never clobbers an owner's manual edits. */
  create(businessId: string, input: CampaignInput): Promise<{ id: string; inserted: boolean }>
  get(id: string): Promise<CampaignRecord | undefined>
  setStatus(id: string, status: CampaignRecord['status']): Promise<void>
  /** Most recent first. */
  listByBusiness(businessId: string, limit?: number): Promise<CampaignRecord[]>
}
