import type { JsonValue } from '../json.js'
import type { OpportunityInput, OpportunityStore } from '../opportunities/store.js'
import { assertOpportunityScores } from '../opportunities/scoring.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

function assertProposeOpportunityPayload(payload: JsonValue): OpportunityInput {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    typeof payload.name !== 'string' ||
    typeof payload.problem !== 'string' ||
    typeof payload.targetCustomer !== 'string' ||
    typeof payload.recommendation !== 'string'
  ) {
    throw new TypeError(
      'propose_opportunity payload must include name, problem, targetCustomer, recommendation (all strings) and scores'
    )
  }
  assertOpportunityScores(payload.scores)
  return {
    name: payload.name,
    problem: payload.problem,
    targetCustomer: payload.targetCustomer,
    recommendation: payload.recommendation,
    scores: payload.scores,
  }
}

/**
 * Step 17: the Opportunity Discovery Agent's one real side effect — write
 * a proposed opportunity into the same table the owner's own manual
 * entries (step 15) live in. Money never enters into this (no
 * expectedCost on the request that leads here), so under step 18's
 * policy this auto-executes the moment the agent proposes it; the
 * `context.agentId` this executor is called with is what tags the row as
 * agent-proposed, not owner-authored (see the dashboard's opportunities
 * page for how that's surfaced).
 */
export function createProposeOpportunityExecutor(opportunityStore: OpportunityStore): ExecutorFn {
  return async (payload, context) => {
    const input = assertProposeOpportunityPayload(payload)
    const id = await opportunityStore.create({ ...input, proposedByAgentId: context.agentId })
    return { id, name: input.name }
  }
}

export function registerProposeOpportunityExecutor(opportunityStore: OpportunityStore): void {
  registerExecutor('propose_opportunity', createProposeOpportunityExecutor(opportunityStore))
}
