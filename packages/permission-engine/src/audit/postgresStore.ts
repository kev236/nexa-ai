import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { JsonValue } from '../json.js'
import type { ActionRequest } from '../types.js'
import type { AuditLogRecord, AuditLogStore } from './store.js'

type Row = {
  id: string
  business_id: string
  agent_id: string | null
  action_type: string
  payload: JsonValue
  reasoning: string
  expected_result: JsonValue
  expected_cost_amount_cents: string | null
  expected_cost_currency: string | null
  status: AuditLogRecord['status']
  actual_result: JsonValue | null
  denied_reason: string | null
  abandoned_reason: string | null
  failed_reason: string | null
  requested_at: string
  resolved_at: string | null
}

function toRecord(row: Row): AuditLogRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    agentId: row.agent_id ?? '',
    actionType: row.action_type,
    payload: row.payload,
    reasoning: row.reasoning,
    expectedResult: row.expected_result,
    expectedCost:
      row.expected_cost_amount_cents !== null && row.expected_cost_currency !== null
        ? { amountCents: Number(row.expected_cost_amount_cents), currency: row.expected_cost_currency }
        : undefined,
    status: row.status,
    actualResult: row.actual_result ?? undefined,
    deniedReason: row.denied_reason ?? undefined,
    abandonedReason: row.abandoned_reason ?? undefined,
    failedReason: row.failed_reason ?? undefined,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at ?? undefined,
  }
}

export class PostgresAuditLogStore implements AuditLogStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async recordRequested(request: ActionRequest): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO audit_log
         (business_id, agent_id, action_type, payload, reasoning, expected_result,
          expected_cost_amount_cents, expected_cost_currency, status, requested_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'requested', now())
       RETURNING id`,
      [
        request.businessId,
        request.agentId,
        request.actionType,
        JSON.stringify(request.payload),
        request.reasoning,
        JSON.stringify(request.expectedResult),
        request.expectedCost?.amountCents ?? null,
        request.expectedCost?.currency ?? null,
      ]
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('audit_log insert returned no id')
    return id
  }

  async recordDenied(auditId: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE audit_log SET status = 'denied', denied_reason = $2, resolved_at = now() WHERE id = $1`,
      [auditId, reason]
    )
  }

  async recordExecuted(auditId: string, result: JsonValue): Promise<void> {
    await this.pool.query(
      `UPDATE audit_log SET status = 'executed', actual_result = $2, resolved_at = now() WHERE id = $1`,
      [auditId, JSON.stringify(result)]
    )
  }

  async recordAbandoned(auditId: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE audit_log SET status = 'abandoned', abandoned_reason = $2, resolved_at = now() WHERE id = $1`,
      [auditId, reason]
    )
  }

  async recordFailed(auditId: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE audit_log SET status = 'failed', failed_reason = $2, resolved_at = now() WHERE id = $1`,
      [auditId, reason]
    )
  }

  async get(auditId: string): Promise<AuditLogRecord | undefined> {
    const result = await this.pool.query<Row>('SELECT * FROM audit_log WHERE id = $1', [auditId])
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async listByBusiness(businessId: string, limit = 100): Promise<AuditLogRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM audit_log WHERE business_id = $1 ORDER BY requested_at DESC LIMIT $2`,
      [businessId, limit]
    )
    return result.rows.map(toRecord)
  }

  async listStaleRequested(olderThanMs: number, limit = 100): Promise<AuditLogRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM audit_log
       WHERE status = 'requested' AND requested_at < now() - ($1 * interval '1 millisecond')
       ORDER BY requested_at ASC LIMIT $2`,
      [olderThanMs, limit]
    )
    return result.rows.map(toRecord)
  }

  async sumExecutedCost(businessId: string, currency: string, sinceMs: number): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(expected_cost_amount_cents), 0) AS total FROM audit_log
       WHERE business_id = $1 AND status = 'executed' AND expected_cost_currency = $2
         AND resolved_at >= now() - ($3 * interval '1 millisecond')`,
      [businessId, currency, sinceMs]
    )
    return Number(result.rows[0]?.total ?? 0)
  }
}

export function createPostgresAuditLogStore(): AuditLogStore {
  return new PostgresAuditLogStore()
}
