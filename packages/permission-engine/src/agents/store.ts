import type { JsonValue } from '../json.js'

export type AgentRecord = {
  id: string
  businessId: string
  key: string
  role: string
  /** Free-form, agent-specific config — no keys read by engine.ts itself since step 18 (auto-approval no longer depends on agent config; see engine.ts's shouldAutoApprove). Kept for agents that want their own settings. */
  config: JsonValue
  active: boolean
  createdAt: string
}

/**
 * Read-only on purpose — agents are config, not code (invariant #5),
 * created and updated only by db/registerAgent.mjs, run directly by a
 * trusted operator. Step 8 needs this to resolve a key to an id without
 * raw SQL (see BusinessStore.getBySlug for the same reasoning) and to
 * show an agent status strip on the dashboard. Step 11 (superseded by
 * step 18) needed getById() because ActionRequest.agentId is already an
 * id, not a key — requestAction() has no businessId+key pair to look up
 * with; still true and still needed under step 18's simpler policy,
 * since shouldAutoApprove() still needs to confirm the agent exists and
 * is active.
 */
export interface AgentStore {
  getByKey(businessId: string, key: string): Promise<AgentRecord | undefined>
  getById(agentId: string): Promise<AgentRecord | undefined>
  listByBusiness(businessId: string): Promise<AgentRecord[]>
}
