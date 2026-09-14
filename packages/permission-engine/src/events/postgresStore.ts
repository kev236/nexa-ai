import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { ObservedEvent } from '../adapters/types.js'
import type { JsonValue } from '../json.js'
import type { EventRecord, EventStore } from './store.js'

type Row = {
  id: string
  business_id: string
  source: string
  type: string
  payload: JsonValue
  occurred_at: string
  ingested_at: string
  ingestion_mode: EventRecord['ingestionMode']
  external_id: string | null
}

function toRecord(row: Row): EventRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    source: row.source,
    type: row.type,
    payload: row.payload,
    occurredAt: row.occurred_at,
    ingestedAt: row.ingested_at,
    ingestionMode: row.ingestion_mode,
    externalId: row.external_id ?? undefined,
  }
}

export class PostgresEventStore implements EventStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async record(
    businessId: string,
    event: ObservedEvent,
    ingestionMode: 'backfill' | 'poll' | 'webhook'
  ): Promise<{ id: string; inserted: boolean }> {
    const result = await this.pool.query<{ id: string; inserted: boolean }>(
      `INSERT INTO events (business_id, source, type, payload, occurred_at, ingestion_mode, external_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (business_id, source, external_id) WHERE external_id IS NOT NULL DO NOTHING
       RETURNING id, true AS inserted`,
      [businessId, event.source, event.type, JSON.stringify(event.payload), event.occurredAt, ingestionMode, event.externalId ?? null]
    )
    if (result.rows[0]) return result.rows[0]

    // Conflict hit — the row already exists; look it up so callers always get an id.
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM events WHERE business_id = $1 AND source = $2 AND external_id = $3`,
      [businessId, event.source, event.externalId]
    )
    const id = existing.rows[0]?.id
    if (!id) throw new Error('events insert conflicted but no existing row was found')
    return { id, inserted: false }
  }

  async listByBusiness(businessId: string, limit = 100): Promise<EventRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM events WHERE business_id = $1 ORDER BY occurred_at ASC LIMIT $2`,
      [businessId, limit]
    )
    return result.rows.map(toRecord)
  }
}

export function createPostgresEventStore(): EventStore {
  return new PostgresEventStore()
}
