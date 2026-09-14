import { randomUUID } from 'node:crypto'
import type { JsonValue } from '../json.js'
import type { ActionRequest } from '../types.js'
import type { AuditLogRecord, AuditLogStore } from './store.js'

/**
 * Reference implementation used by default and in tests. Append-only by
 * construction: the only mutations record* methods perform are filling in
 * status/resolvedAt/actualResult on the one record identified by auditId,
 * never rewriting requestedAt/payload/reasoning after the fact.
 */
export class InMemoryAuditLogStore implements AuditLogStore {
  private records = new Map<string, AuditLogRecord>()

  async recordRequested(request: ActionRequest): Promise<string> {
    const id = randomUUID()
    const record: AuditLogRecord = {
      id,
      businessId: request.businessId,
      agentId: request.agentId,
      actionType: request.actionType,
      payload: request.payload,
      reasoning: request.reasoning,
      expectedResult: request.expectedResult,
      expectedCost: request.expectedCost,
      status: 'requested',
      requestedAt: new Date().toISOString(),
    }
    this.records.set(id, record)
    return id
  }

  async recordDenied(auditId: string, reason: string): Promise<void> {
    const record = this.mustGet(auditId)
    record.status = 'denied'
    record.deniedReason = reason
    record.resolvedAt = new Date().toISOString()
  }

  async recordExecuted(auditId: string, result: JsonValue): Promise<void> {
    const record = this.mustGet(auditId)
    record.status = 'executed'
    record.actualResult = result
    record.resolvedAt = new Date().toISOString()
  }

  async get(auditId: string): Promise<AuditLogRecord | undefined> {
    return this.records.get(auditId)
  }

  async listByBusiness(businessId: string, limit = 100): Promise<AuditLogRecord[]> {
    // Ascending sort (stable — ties keep insertion order) then reverse,
    // rather than sorting descending directly: two requests can land in
    // the same millisecond, and a descending sort's stable tie-break
    // would wrongly keep the earlier one first instead of the later one.
    return [...this.records.values()]
      .filter((r) => r.businessId === businessId)
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
      .reverse()
      .slice(0, limit)
  }

  private mustGet(auditId: string): AuditLogRecord {
    const record = this.records.get(auditId)
    if (!record) throw new Error(`no audit_log record for id ${auditId}`)
    return record
  }
}
