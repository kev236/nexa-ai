import type { JsonValue } from '../json.js'
import type { BusinessRecord, BusinessStore } from './store.js'

export class InMemoryBusinessStore implements BusinessStore {
  constructor(
    private readonly configs = new Map<string, JsonValue>(),
    private readonly records = new Map<string, BusinessRecord>()
  ) {}

  async getConfig(businessId: string): Promise<JsonValue> {
    return this.configs.get(businessId) ?? {}
  }

  async getBySlug(slug: string): Promise<BusinessRecord | undefined> {
    return [...this.records.values()].find((r) => r.slug === slug)
  }
}
