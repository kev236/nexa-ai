import type { AgentRecord, AgentStore } from './store.js'

export class InMemoryAgentStore implements AgentStore {
  constructor(private readonly records = new Map<string, AgentRecord>()) {}

  async getByKey(businessId: string, key: string): Promise<AgentRecord | undefined> {
    return [...this.records.values()].find((r) => r.businessId === businessId && r.key === key)
  }

  async listByBusiness(businessId: string): Promise<AgentRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.businessId === businessId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
}
