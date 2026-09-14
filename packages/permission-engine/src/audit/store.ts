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
  status: 'requested' | 'denied' | 'executed'
  actualResult?: JsonValue
  deniedReason?: string
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
  get(auditId: string): Promise<AuditLogRecord | undefined>
}
