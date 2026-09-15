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
  /**
   * resolvedBy is omitted only for step 11's autonomy-level-2 auto-approve
   * path — "nobody but the owner approves anything" (readme.md) still
   * holds there: the owner pre-authorized this class of action by setting
   * autonomy_level + a confidence threshold in config, so there's no
   * per-instance human resolvedBy to record. Every human-driven resolution
   * (the dashboard's Approve/Deny) always passes a real owner id.
   */
  resolve(approvalId: string, status: 'approved' | 'denied', resolvedBy?: string): Promise<void>
  /** Oldest first — the dashboard's approval queue. */
  listPending(): Promise<ApprovalRecord[]>
  /** Most recent first — step 11: lets a caller see how an approval was actually resolved (owner vs. auto). */
  listByBusiness(businessId: string, limit?: number): Promise<ApprovalRecord[]>
}
