import type { JsonValue } from '../json.js'
import type { ObservedEvent } from '../adapters/types.js'

export type EventRecord = {
  id: string
  businessId: string
  source: string
  type: string
  payload: JsonValue
  occurredAt: string
  ingestedAt: string
  ingestionMode: 'backfill' | 'poll' | 'webhook'
  externalId?: string
}

export interface EventStore {
  /** Idempotent on (source, externalId) — inserted:false means it was already there. */
  record(
    businessId: string,
    event: ObservedEvent,
    ingestionMode: 'backfill' | 'poll' | 'webhook'
  ): Promise<{ id: string; inserted: boolean }>
  listByBusiness(businessId: string, limit?: number): Promise<EventRecord[]>
}
