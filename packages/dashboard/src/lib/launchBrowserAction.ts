import 'server-only'
import type { ActionOutcome } from '@nexa-ai/permission-engine'
import type { getEngine } from './engine'

const AGENT_KEY = 'browser-action-agent'

/**
 * The submission half of plan-then-approve-then-execute — takes an
 * owner-specified action (there's no autonomous planning agent yet that
 * reads a page and decides what to click; that's a separate, larger
 * piece, and one that needs a working Claude API key to boot, which this
 * account doesn't have right now anyway) and sends it to the approval
 * queue with requiresReview: true, so it always lands as pending_approval
 * regardless of agent/confidence — same reasoning as tiktokAdsLaunch.ts's
 * expectedCost, just for actions instead of money.
 */
export async function launchBrowserAction(
  engine: ReturnType<typeof getEngine>,
  businessId: string,
  input: {
    url: string
    actionType: 'click' | 'fill' | 'check'
    targetRole: 'button' | 'link' | 'textbox' | 'checkbox'
    targetName: string
    value?: string
  }
): Promise<ActionOutcome> {
  const agent = await engine.agentStore.getByKey(businessId, AGENT_KEY)
  if (!agent) {
    throw new Error(`no agent '${AGENT_KEY}' registered for this business — run db:register-agent first`)
  }

  return engine.requestAction({
    businessId,
    agentId: agent.id,
    actionType: 'browser_action',
    payload: {
      url: input.url,
      actionType: input.actionType,
      targetRole: input.targetRole,
      targetName: input.targetName,
      ...(input.value !== undefined ? { value: input.value } : {}),
    },
    reasoning: `Owner-specified: ${input.actionType} the ${input.targetRole} "${input.targetName}" on ${input.url}.`,
    expectedResult: { url: input.url, actionType: input.actionType, targetName: input.targetName },
    requiresReview: true,
  })
}
