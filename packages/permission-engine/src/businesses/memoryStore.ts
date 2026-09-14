import type { JsonValue } from '../json.js'
import type { BusinessStore } from './store.js'

export class InMemoryBusinessStore implements BusinessStore {
  constructor(private readonly configs = new Map<string, JsonValue>()) {}

  async getConfig(businessId: string): Promise<JsonValue> {
    return this.configs.get(businessId) ?? {}
  }
}
