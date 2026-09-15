import type { PermissionEngine } from '../engine.js'
import type { MessagesClient } from '../llm/client.js'
import { normalizeCampaign, type CampaignNormalizationResult } from './campaignAgent.js'

export type ImportCampaignResult = {
  campaignId: string
  inserted: boolean
  normalization: CampaignNormalizationResult
}

/**
 * The Campaign Agent's one run: normalize one raw campaign (pasted brief,
 * CSV row, manual description) and store it. One-shot per import, not a
 * batch loop over a queue — there's nothing waiting to be processed until
 * a human supplies raw text, unlike the event-driven agents. Kept in one
 * place (rather than inlined in the CLI script and the dashboard's server
 * action separately) for the same reason every other agent's run
 * function is: so both call sites can't drift.
 */
export async function importCampaignOnce(
  engine: PermissionEngine,
  llmClient: MessagesClient,
  businessId: string,
  rawInput: string,
  externalId?: string
): Promise<ImportCampaignResult> {
  const normalization = await normalizeCampaign(llmClient, rawInput)

  const { id, inserted } = await engine.campaignStore.create(businessId, {
    externalId,
    product: normalization.product,
    targetAudience: normalization.targetAudience,
    problem: normalization.problem,
    benefits: normalization.benefits,
    uniqueSellingPoints: normalization.uniqueSellingPoints,
    allowedClaims: normalization.allowedClaims,
    forbiddenClaims: normalization.forbiddenClaims,
    cta: normalization.cta,
    landingPage: normalization.landingPage,
    availableAssets: normalization.availableAssets,
    rawInput,
  })

  // A duplicate externalId means the store left the existing row
  // untouched and discarded what was just normalized above (it never
  // overwrites a possibly-edited campaign) — reflect the real stored
  // data back, not the freshly computed result nothing kept.
  if (!inserted) {
    const stored = await engine.campaignStore.get(id)
    if (stored) {
      return {
        campaignId: id,
        inserted,
        normalization: {
          product: stored.product,
          targetAudience: stored.targetAudience,
          problem: stored.problem,
          benefits: stored.benefits,
          uniqueSellingPoints: stored.uniqueSellingPoints,
          allowedClaims: stored.allowedClaims,
          forbiddenClaims: stored.forbiddenClaims,
          cta: stored.cta,
          landingPage: stored.landingPage,
          availableAssets: stored.availableAssets,
          reasoning: 'Campaign already existed for this externalId — showing the stored record, not a fresh re-normalization.',
          confidence: 1,
        },
      }
    }
  }

  return { campaignId: id, inserted, normalization }
}
