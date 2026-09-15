import type { JsonValue } from '../json.js'
import type { ActionRequest } from '../types.js'

export type AuditLogRecord = {
  id: string
  businessId: string
  agentId: string
  actionType: string
  payload: JsonValue
  reasoning: string
  expectedResult: JsonValue
  expectedCost?: { amountCents: number; currency: string }
  status: 'requested' | 'denied' | 'executed' | 'abandoned'
  actualResult?: JsonValue
  deniedReason?: string
  /** Step 12: set only when status is 'abandoned' — see recordAbandoned(). */
  abandonedReason?: string
  requestedAt: string
  resolvedAt?: string
}

/**
 * "Audit before execute" (invariant #2) means this store is written to at
 * request time, before any approval or execution exists — recordRequested
 * must complete before requestAction returns anything. A Postgres-backed
 * implementation of this interface is a later change; nothing above it
 * should need to change when that lands.
 */
export interface AuditLogStore {
  recordRequested(request: ActionRequest): Promise<string>
  recordDenied(auditId: string, reason: string): Promise<void>
  recordExecuted(auditId: string, result: JsonValue): Promise<void>
  /** Step 12: a crashed/killed run's row, discovered later — never a normal resolution path. See reapAbandonedRequests() in engine.ts. */
  recordAbandoned(auditId: string, reason: string): Promise<void>
  get(auditId: string): Promise<AuditLogRecord | undefined>
  /** Most recent first — the dashboard's activity feed (step 8). */
  listByBusiness(businessId: string, limit?: number): Promise<AuditLogRecord[]>
  /**
   * Step 12: rows still 'requested' that have sat that way for at least
   * `olderThanMs` — candidates for reapAbandonedRequests(). Oldest first.
   * Deliberately not scoped to one business — the reaper sweeps every
   * business in one pass, same as a cron job would.
   */
  listStaleRequested(olderThanMs: number, limit?: number): Promise<AuditLogRecord[]>
  /** Step 13: cents already executed for this business+currency, resolved within the last `sinceMs` ms — the "ledger" side of a spending cap. */
  sumExecutedCost(businessId: string, currency: string, sinceMs: number): Promise<number>
}
