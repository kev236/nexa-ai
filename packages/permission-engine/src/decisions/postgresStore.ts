import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { JsonValue } from '../json.js'
import type { DecisionInput, DecisionRecord, DecisionStore } from './store.js'

type Row = {
  id: string
  business_id: string
  agent_id: string | null
  event_id: string | null
  action_type: string
  reasoning: string
  expected_result: JsonValue
  actual_result: JsonValue | null
  confidence: string | null
  created_at: string
  resolved_at: string | null
}

function toRecord(row: Row): DecisionRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    agentId: row.agent_id ?? undefined,
    eventId: row.event_id ?? undefined,
    actionType: row.action_type,
    reasoning: row.reasoning,
    expectedResult: row.expected_result,
    actualResult: row.actual_result ?? undefined,
    confidence: row.confidence !== null ? Number(row.confidence) : undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  }
}

export class PostgresDecisionStore implements DecisionStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async record(input: DecisionInput): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO decisions (business_id, agent_id, event_id, action_type, reasoning, expected_result, confidence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       RETURNING id`,
      [
        input.businessId,
        input.agentId ?? null,
        input.eventId ?? null,
        input.actionType,
        input.reasoning,
        JSON.stringify(input.expectedResult),
        input.confidence ?? null,
      ]
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('decisions insert returned no id')
    return id
  }

  async hasDecisionForEvent(eventId: string): Promise<boolean> {
    const result = await this.pool.query(`SELECT 1 FROM decisions WHERE event_id = $1 LIMIT 1`, [eventId])
    return result.rows.length > 0
  }

  async listByBusiness(businessId: string, limit = 100): Promise<DecisionRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM decisions WHERE business_id = $1 ORDER BY created_at ASC LIMIT $2`,
      [businessId, limit]
    )
    return result.rows.map(toRecord)
  }
}

export function createPostgresDecisionStore(): DecisionStore {
  return new PostgresDecisionStore()
}
