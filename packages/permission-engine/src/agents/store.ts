import type { JsonValue } from '../json.js'

export type AgentRecord = {
  id: string
  businessId: string
  key: string
  role: string
  autonomyLevel: number
  /** Step 11: e.g. { autoApproveMinConfidence: 0.9 } — read only by engine.ts's auto-approve gate, never business logic baked into core. */
  config: JsonValue
  active: boolean
  createdAt: string
}

/**
 * Read-only on purpose — agents are config, not code (invariant #5),
 * created and updated only by db/registerAgent.mjs / db/setAgentAutonomy.mjs,
 * run directly by a trusted operator. Step 8 needs this to resolve a key
 * to an id without raw SQL (see BusinessStore.getBySlug for the same
 * reasoning) and to show an agent status strip on the dashboard. Step 11
 * needs getById() because ActionRequest.agentId is already an id, not a
 * key — requestAction() has no businessId+key pair to look up with.
 */
export interface AgentStore {
  getByKey(businessId: string, key: string): Promise<AgentRecord | undefined>
  getById(agentId: string): Promise<AgentRecord | undefined>
  listByBusiness(businessId: string): Promise<AgentRecord[]>
}
