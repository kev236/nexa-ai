import 'server-only'
import type { ActionOutcome } from '@nexa-ai/permission-engine'
import type { getEngine } from './engine'

const AGENT_KEY = 'tiktok-ads-agent'

/**
 * Launches a TikTok Spark Ads campaign boosting an already-posted video —
 * the first action in this codebase that sets expectedCost, so it always
 * lands in the pending-approval queue (shouldAutoApprove treats
 * expectedCost as the sole reason to wait, regardless of agent or
 * confidence) — the owner clicking Approve on the real daily spend *is*
 * the spending control here, same as every other costed decision already
 * made through this dashboard.
 */
export async function launchTiktokAd(
  engine: ReturnType<typeof getEngine>,
  businessId: string,
  input: { tiktokItemId: string; campaignName: string; dailyBudgetCents: number; currency: string }
): Promise<ActionOutcome> {
  const agent = await engine.agentStore.getByKey(businessId, AGENT_KEY)
  if (!agent) {
    throw new Error(`no agent '${AGENT_KEY}' registered for this business — run db:register-agent first`)
  }

  return engine.requestAction({
    businessId,
    agentId: agent.id,
    actionType: 'launch_tiktok_ad',
    payload: {
      tiktokItemId: input.tiktokItemId,
      campaignName: input.campaignName,
      dailyBudgetCents: input.dailyBudgetCents,
      currency: input.currency,
    },
    reasoning: `Owner-requested TikTok Spark Ads boost of an existing video, ${(input.dailyBudgetCents / 100).toFixed(2)} ${input.currency}/day.`,
    expectedResult: { campaignName: input.campaignName, tiktokItemId: input.tiktokItemId },
    expectedCost: { amountCents: input.dailyBudgetCents, currency: input.currency },
  })
}
