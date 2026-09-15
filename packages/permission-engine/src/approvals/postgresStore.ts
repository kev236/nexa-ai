import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { ActionRequest } from '../types.js'
import type { ApprovalRecord, ApprovalStore } from './store.js'

type Row = {
  id: string
  audit_id: string
  request: ActionRequest
  status: ApprovalRecord['status']
  resolved_by: string | null
  created_at: string
  resolved_at: string | null
}

function toRecord(row: Row): ApprovalRecord {
  return {
    id: row.id,
    auditId: row.audit_id,
    request: row.request,
    status: row.status,
    resolvedBy: row.resolved_by ?? undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  }
}

export class PostgresApprovalStore implements ApprovalStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async createPending(request: ActionRequest, auditId: string): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO approvals (audit_id, business_id, request, status, created_at)
       VALUES ($1, $2, $3, 'pending', now())
       RETURNING id`,
      [auditId, request.businessId, JSON.stringify(request)]
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('approvals insert returned no id')
    return id
  }

  async get(approvalId: string): Promise<ApprovalRecord | undefined> {
    const result = await this.pool.query<Row>('SELECT * FROM approvals WHERE id = $1', [approvalId])
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async resolve(approvalId: string, status: 'approved' | 'denied', resolvedBy?: string): Promise<void> {
    await this.pool.query(
      `UPDATE approvals SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1`,
      [approvalId, status, resolvedBy ?? null]
    )
  }

  async listPending(): Promise<ApprovalRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC`
    )
    return result.rows.map(toRecord)
  }

  async listByBusiness(businessId: string, limit = 100): Promise<ApprovalRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM approvals WHERE business_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [businessId, limit]
    )
    return result.rows.map(toRecord)
  }
}

export function createPostgresApprovalStore(): ApprovalStore {
  return new PostgresApprovalStore()
}
