export type AgentRecord = {
  id: string
  businessId: string
  key: string
  role: string
  autonomyLevel: number
  active: boolean
  createdAt: string
}

/**
 * Read-only on purpose — agents are config, not code (invariant #5),
 * created and updated only by db/registerAgent.mjs, run directly by a
 * trusted operator. Step 8 needs this to resolve a key to an id without
 * raw SQL (see BusinessStore.getBySlug for the same reasoning) and to
 * show an agent status strip on the dashboard.
 */
export interface AgentStore {
  getByKey(businessId: string, key: string): Promise<AgentRecord | undefined>
  listByBusiness(businessId: string): Promise<AgentRecord[]>
}
