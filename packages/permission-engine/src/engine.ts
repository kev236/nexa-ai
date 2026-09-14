import { assertActionRequest } from './validate.js'
import type { AuditLogStore } from './audit/store.js'
import { InMemoryAuditLogStore } from './audit/memoryStore.js'
import type { ApprovalStore, ApprovalRecord } from './approvals/store.js'
import { InMemoryApprovalStore } from './approvals/memoryStore.js'
import type { OwnerStore } from './owners/store.js'
import { InMemoryOwnerStore } from './owners/memoryStore.js'
import type { EventStore } from './events/store.js'
import { InMemoryEventStore } from './events/memoryStore.js'
import type { DecisionStore } from './decisions/store.js'
import { InMemoryDecisionStore } from './decisions/memoryStore.js'
import type { BusinessAdapter } from './adapters/types.js'
import { hashPassword, verifyPassword } from './password.js'
import { getExecutor } from './executors/registry.js'
import type { ActionOutcome, ActionRequest } from './types.js'

export type PermissionEngineDeps = {
  auditStore?: AuditLogStore
  approvalStore?: ApprovalStore
  ownerStore?: OwnerStore
  eventStore?: EventStore
  decisionStore?: DecisionStore
}

export type IngestSummary = { observed: number; inserted: number; skipped: number }

export type PermissionEngine = {
  requestAction(request: ActionRequest): Promise<ActionOutcome>
  resolveApproval(
    approvalId: string,
    decision: 'approved' | 'denied',
    resolvedBy: string
  ): Promise<ActionOutcome>
  listPendingApprovals(): Promise<ApprovalRecord[]>
  verifyOwnerCredentials(email: string, password: string): Promise<{ ownerId: string } | null>
  ingestEvents(
    adapter: BusinessAdapter,
    businessId: string,
    mode: 'backfill' | 'poll',
    since?: string
  ): Promise<IngestSummary>
  auditStore: AuditLogStore
  approvalStore: ApprovalStore
  ownerStore: OwnerStore
  eventStore: EventStore
  decisionStore: DecisionStore
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
  const ownerStore = deps.ownerStore ?? new InMemoryOwnerStore()
  const eventStore = deps.eventStore ?? new InMemoryEventStore()
  const decisionStore = deps.decisionStore ?? new InMemoryDecisionStore()

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
    const result = await executor(approval.request.payload, {
      businessId: approval.request.businessId,
    })
    await auditStore.recordExecuted(approval.auditId, result)
    return { status: 'executed', auditId: approval.auditId, result }
  }

  async function listPendingApprovals(): Promise<ApprovalRecord[]> {
    return approvalStore.listPending()
  }

  async function verifyOwnerCredentials(
    email: string,
    password: string
  ): Promise<{ ownerId: string } | null> {
    const owner = await ownerStore.findByEmail(email)
    // Always run verifyPassword, even against a dummy hash when no owner
    // exists — constant-time comparison inside verifyPassword only helps
    // if this function doesn't itself leak "no such owner" via an early
    // return with a different timing profile than a wrong-password path.
    const hash = owner?.passwordHash ?? DUMMY_HASH_FOR_TIMING
    const valid = verifyPassword(password, hash)
    if (!owner || !valid) return null
    return { ownerId: owner.id }
  }

  async function ingestEvents(
    adapter: BusinessAdapter,
    businessId: string,
    mode: 'backfill' | 'poll',
    since?: string
  ): Promise<IngestSummary> {
    const observed = mode === 'backfill' ? await adapter.backfill() : await adapter.observe(since ?? new Date(0).toISOString())

    let inserted = 0
    let skipped = 0
    for (const event of observed) {
      const result = await eventStore.record(businessId, event, mode)
      if (result.inserted) inserted++
      else skipped++
    }
    return { observed: observed.length, inserted, skipped }
  }

  return {
    requestAction,
    resolveApproval,
    listPendingApprovals,
    verifyOwnerCredentials,
    ingestEvents,
    auditStore,
    approvalStore,
    ownerStore,
    eventStore,
    decisionStore,
  }
}

// A real scrypt hash of an unguessed, fixed value — generated the normal
// way so its format is guaranteed correct — used only so a lookup miss
// and a wrong password take the same code path through verifyPassword
// rather than one returning early.
const DUMMY_HASH_FOR_TIMING = hashPassword('nexa-ai-dummy-password-for-timing-safety-only')

const defaultEngine = createPermissionEngine()

export const requestAction = defaultEngine.requestAction
export const resolveApproval = defaultEngine.resolveApproval
export const listPendingApprovals = defaultEngine.listPendingApprovals
export const verifyOwnerCredentials = defaultEngine.verifyOwnerCredentials
export const ingestEvents = defaultEngine.ingestEvents
