import { randomUUID } from 'node:crypto'
import type { ObservedEvent } from '../adapters/types.js'
import type { EventRecord, EventStore } from './store.js'

export class InMemoryEventStore implements EventStore {
  private records = new Map<string, EventRecord>()
  private byExternalId = new Map<string, string>() // `${source}:${externalId}` -> id

  async record(
    businessId: string,
    event: ObservedEvent,
    ingestionMode: 'backfill' | 'poll' | 'webhook'
  ): Promise<{ id: string; inserted: boolean }> {
    if (event.externalId) {
      const key = `${businessId}:${event.source}:${event.externalId}`
      const existingId = this.byExternalId.get(key)
      if (existingId) return { id: existingId, inserted: false }
      const id = randomUUID()
      this.records.set(id, {
        id,
        businessId,
        source: event.source,
        type: event.type,
        payload: event.payload,
        occurredAt: event.occurredAt,
        ingestedAt: new Date().toISOString(),
        ingestionMode,
        externalId: event.externalId,
      })
      this.byExternalId.set(key, id)
      return { id, inserted: true }
    }

    const id = randomUUID()
    this.records.set(id, {
      id,
      businessId,
      source: event.source,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt,
      ingestedAt: new Date().toISOString(),
      ingestionMode,
    })
    return { id, inserted: true }
  }

  async listByBusiness(businessId: string, limit = 100): Promise<EventRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.businessId === businessId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .slice(0, limit)
  }
}
