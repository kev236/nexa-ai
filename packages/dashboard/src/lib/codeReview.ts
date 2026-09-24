import 'server-only'
import type { ActionOutcome } from '@nexa-ai/permission-engine'
import type { getEngine } from './engine'

const AGENT_KEY = 'code-review-agent'

/**
 * Nexa AI proposing a change to its own source — always lands in the
 * approval queue (requiresReview: true) with the literal new file
 * content and explanation visible, same reasoning as launchBrowserAction
 * and launchTiktokAd: the owner approving *is* the review, and even
 * after that, this only opens a GitHub pull request — merging is a
 * separate, later, human action on GitHub itself, not something this
 * system ever does on its own.
 */
export async function proposeCodeChange(
  engine: ReturnType<typeof getEngine>,
  businessId: string,
  input: { path: string; newContent: string; commitMessage: string; explanation: string }
): Promise<ActionOutcome> {
  const agent = await engine.agentStore.getByKey(businessId, AGENT_KEY)
  if (!agent) {
    throw new Error(`no agent '${AGENT_KEY}' registered for this business — run db:register-agent first`)
  }

  return engine.requestAction({
    businessId,
    agentId: agent.id,
    actionType: 'propose_code_change',
    payload: {
      path: input.path,
      newContent: input.newContent,
      commitMessage: input.commitMessage,
      explanation: input.explanation,
    },
    reasoning: input.explanation,
    expectedResult: { path: input.path, commitMessage: input.commitMessage },
    requiresReview: true,
  })
}
