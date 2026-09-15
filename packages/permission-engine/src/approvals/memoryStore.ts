import { randomUUID } from 'node:crypto'
import type { ActionRequest } from '../types.js'
import type { ApprovalRecord, ApprovalStore } from './store.js'

export class InMemoryApprovalStore implements ApprovalStore {
  private records = new Map<string, ApprovalRecord>()

  async createPending(request: ActionRequest, auditId: string): Promise<string> {
    const id = randomUUID()
    this.records.set(id, {
      id,
      auditId,
      request,
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
    return id
  }

  async get(approvalId: string): Promise<ApprovalRecord | undefined> {
    return this.records.get(approvalId)
  }

  async getByAuditId(auditId: string): Promise<ApprovalRecord | undefined> {
    return [...this.records.values()].find((r) => r.auditId === auditId)
  }

  async resolve(approvalId: string, status: 'approved' | 'denied', resolvedBy?: string): Promise<void> {
    const record = this.records.get(approvalId)
    if (!record) throw new Error(`no approval record for id ${approvalId}`)
    record.status = status
    record.resolvedBy = resolvedBy
    record.resolvedAt = new Date().toISOString()
  }

  async listPending(): Promise<ApprovalRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.status === 'pending')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async listByBusiness(businessId: string, limit = 100): Promise<ApprovalRecord[]> {
    // Ascending then reverse, not a direct descending sort — see
    // audit/memoryStore.ts's listByBusiness for why (stable-sort ties).
    return [...this.records.values()]
      .filter((r) => r.request.businessId === businessId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .reverse()
      .slice(0, limit)
  }

  async sumPendingCost(businessId: string, currency: string): Promise<number> {
    return [...this.records.values()]
      .filter(
        (r) =>
          r.request.businessId === businessId &&
          r.status === 'pending' &&
          r.request.expectedCost?.currency === currency
      )
      .reduce((sum, r) => sum + (r.request.expectedCost?.amountCents ?? 0), 0)
  }
}
