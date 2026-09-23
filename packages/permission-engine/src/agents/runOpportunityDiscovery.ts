import type { PermissionEngine } from '../engine.js'
import type { MessagesClient } from '../llm/client.js'
import { discoverOpportunities } from './opportunityDiscoveryAgent.js'

export type RunOpportunityDiscoveryOptions = {
  /** Stops the LLM call if it runs longer than this — readme.md's "Agents" section (every run needs a wall-clock timeout). */
  timeoutMs?: number
}

export type RunOpportunityDiscoveryResult = {
  proposed: number
  outcomes: Array<{ name: string; status: string }>
}

const DEFAULT_TIMEOUT_MS = 60_000

// Race, not a true cancellation — same caveat as runCreativeGeneration.ts's
// identical helper: the underlying Anthropic API call isn't wired to an
// AbortController, so this bounds how long the caller waits, not how
// long the call itself keeps running.
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`opportunity discovery timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

/**
 * Step 17's one run: propose up to 3 new opportunities and submit each
 * through requestAction() as a 'propose_opportunity' action — audited
 * like any other agent action (invariant #2), and, per step 18's
 * default policy, auto-executed immediately since proposing an idea
 * isn't money. businessId scopes the audit trail entry (which agent, on
 * whose behalf) even though the resulting opportunities row itself has
 * no business_id — see OpportunityStore's own doc comment for why.
 */
export async function runOpportunityDiscoveryOnce(
  engine: PermissionEngine,
  llmClient: MessagesClient,
  businessId: string,
  agentId: string,
  options: RunOpportunityDiscoveryOptions = {}
): Promise<RunOpportunityDiscoveryResult> {
  const existing = await engine.opportunityStore.list()
  const result = await withTimeout(
    discoverOpportunities(
      llmClient,
      existing.map((o) => ({ name: o.name, problem: o.problem }))
    ),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )

  const outcomes: Array<{ name: string; status: string }> = []
  for (const proposal of result.proposals) {
    const outcome = await engine.requestAction({
      businessId,
      agentId,
      actionType: 'propose_opportunity',
      payload: {
        name: proposal.name,
        problem: proposal.problem,
        targetCustomer: proposal.targetCustomer,
        recommendation: proposal.recommendation,
        scores: proposal.scores,
      },
      reasoning: result.reasoning,
      expectedResult: { name: proposal.name, totalScore: proposal.totalScore },
      confidence: result.confidence,
    })
    outcomes.push({ name: proposal.name, status: outcome.status })
  }

  return { proposed: result.proposals.length, outcomes }
}
