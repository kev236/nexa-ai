import type { ActionRequest } from '../types.js'

export type ApprovalRecord = {
  id: string
  auditId: string
  request: ActionRequest
  status: 'pending' | 'approved' | 'denied'
  resolvedBy?: string
  createdAt: string
  resolvedAt?: string
}

export interface ApprovalStore {
  createPending(request: ActionRequest, auditId: string): Promise<string>
  get(approvalId: string): Promise<ApprovalRecord | undefined>
  resolve(approvalId: string, status: 'approved' | 'denied', resolvedBy: string): Promise<void>
  /** Oldest first — the dashboard's approval queue. */
  listPending(): Promise<ApprovalRecord[]>
}
