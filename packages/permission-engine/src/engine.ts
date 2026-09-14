import { assertActionRequest } from './validate.js'
import type { AuditLogStore } from './audit/store.js'
import { InMemoryAuditLogStore } from './audit/memoryStore.js'
import type { ApprovalStore } from './approvals/store.js'
import { InMemoryApprovalStore } from './approvals/memoryStore.js'
import { getExecutor } from './executors/registry.js'
import type { ActionOutcome, ActionRequest } from './types.js'

export type PermissionEngineDeps = {
  auditStore?: AuditLogStore
  approvalStore?: ApprovalStore
}

export type PermissionEngine = {
  requestAction(request: ActionRequest): Promise<ActionOutcome>
  resolveApproval(
    approvalId: string,
    decision: 'approved' | 'denied',
    resolvedBy: string
  ): Promise<ActionOutcome>
  auditStore: AuditLogStore
  approvalStore: ApprovalStore
}

/**
 * Constructs an isolated permission engine instance. The default export
 * below is a singleton built from this with in-memory stores — use this
 * factory directly to inject real stores (a Postgres-backed AuditLogStore,
 * for instance) or to get test isolation between test files.
 */
export function createPermissionEngine(deps: PermissionEngineDeps = {}): PermissionEngine {
  const auditStore = deps.auditStore ?? new InMemoryAuditLogStore()
  const approvalStore = deps.approvalStore ?? new InMemoryApprovalStore()

  async function requestAction(request: ActionRequest): Promise<ActionOutcome> {
    // Structural enforcement of "payload is data, not capability" — a
    // caller that ignores the TypeScript types still can't get a live
    // client or function past this line. See src/json.ts.
    assertActionRequest(request)

    // Audit before execute (invariant #2): this write happens before any
    // approval or execution record exists, and before this function
    // returns anything to the caller.
    const auditId = await auditStore.recordRequested(request)

    const executor = getExecutor(request.actionType)
    if (!executor) {
      const reason = `no executor registered for actionType "${request.actionType}"`
      await auditStore.recordDenied(auditId, reason)
      return { status: 'denied', auditId, reason }
    }

    // Default autonomy is level 1 (invariant #7): every action that has
    // somewhere to go still stops here and waits for an explicit owner
    // decision. There is no code path in this function that executes
    // anything — only resolveApproval does, and only after 'approved'.
    const approvalId = await approvalStore.createPending(request, auditId)
    return { status: 'pending_approval', auditId, approvalId }
  }

  async function resolveApproval(
    approvalId: string,
    decision: 'approved' | 'denied',
    resolvedBy: string
  ): Promise<ActionOutcome> {
    const approval = await approvalStore.get(approvalId)
    if (!approval) throw new Error(`no such approval: ${approvalId}`)
    if (approval.status !== 'pending') {
      throw new Error(`approval ${approvalId} was already resolved (${approval.status})`)
    }

    if (decision === 'denied') {
      await approvalStore.resolve(approvalId, 'denied', resolvedBy)
      const reason = `denied by ${resolvedBy}`
      await auditStore.recordDenied(approval.auditId, reason)
      return { status: 'denied', auditId: approval.auditId, reason }
    }

    const executor = getExecutor(approval.request.actionType)
    if (!executor) {
      // Registered at request time, deregistered before approval — an
      // edge case worth denying loudly rather than silently executing
      // nothing.
      await approvalStore.resolve(approvalId, 'denied', resolvedBy)
      const reason = 'executor no longer registered for this actionType'
      await auditStore.recordDenied(approval.auditId, reason)
      return { status: 'denied', auditId: approval.auditId, reason }
    }

    await approvalStore.resolve(approvalId, 'approved', resolvedBy)
    const result = await executor(approval.request.payload)
    await auditStore.recordExecuted(approval.auditId, result)
    return { status: 'executed', auditId: approval.auditId, result }
  }

  return { requestAction, resolveApproval, auditStore, approvalStore }
}

const defaultEngine = createPermissionEngine()

export const requestAction = defaultEngine.requestAction
export const resolveApproval = defaultEngine.resolveApproval
