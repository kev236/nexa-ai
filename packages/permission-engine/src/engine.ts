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
import type { TransactionStore } from './transactions/store.js'
import { InMemoryTransactionStore } from './transactions/memoryStore.js'
import type { BusinessStore } from './businesses/store.js'
import { InMemoryBusinessStore } from './businesses/memoryStore.js'
import type { AgentStore } from './agents/store.js'
import { InMemoryAgentStore } from './agents/memoryStore.js'
import type { BusinessAdapter, ObservedEvent } from './adapters/types.js'
import { hashPassword, verifyPassword } from './password.js'
import { getExecutor } from './executors/registry.js'
import type { ActionOutcome, ActionRequest } from './types.js'

export type PermissionEngineDeps = {
  auditStore?: AuditLogStore
  approvalStore?: ApprovalStore
  ownerStore?: OwnerStore
  eventStore?: EventStore
  decisionStore?: DecisionStore
  transactionStore?: TransactionStore
  businessStore?: BusinessStore
  agentStore?: AgentStore
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
  ingestTransactions(adapter: BusinessAdapter, businessId: string, since?: string): Promise<IngestSummary>
  /** Step 9: the push counterpart to ingestEvents() — one already-verified, already-translated event from a webhook handler. */
  ingestWebhookEvent(businessId: string, event: ObservedEvent): Promise<{ inserted: boolean }>
  auditStore: AuditLogStore
  approvalStore: ApprovalStore
  ownerStore: OwnerStore
  eventStore: EventStore
  decisionStore: DecisionStore
  transactionStore: TransactionStore
  businessStore: BusinessStore
  agentStore: AgentStore
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
  const transactionStore = deps.transactionStore ?? new InMemoryTransactionStore()
  const businessStore = deps.businessStore ?? new InMemoryBusinessStore()
  const agentStore = deps.agentStore ?? new InMemoryAgentStore()

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

  async function ingestTransactions(
    adapter: BusinessAdapter,
    businessId: string,
    since?: string
  ): Promise<IngestSummary> {
    if (!adapter.listTransactions) {
      throw new Error(`adapter "${adapter.adapterType}" does not support listTransactions`)
    }
    const observed = await adapter.listTransactions(since)

    let inserted = 0
    let skipped = 0
    for (const transaction of observed) {
      const result = await transactionStore.record(businessId, {
        type: transaction.type,
        amountCents: transaction.amountCents,
        currency: transaction.currency,
        externalRef: transaction.externalRef,
        status: transaction.status,
        occurredAt: transaction.occurredAt,
      })
      if (result.inserted) inserted++
      else skipped++
    }
    return { observed: observed.length, inserted, skipped }
  }

  async function ingestWebhookEvent(businessId: string, event: ObservedEvent): Promise<{ inserted: boolean }> {
    const result = await eventStore.record(businessId, event, 'webhook')
    return { inserted: result.inserted }
  }

  return {
    requestAction,
    resolveApproval,
    listPendingApprovals,
    verifyOwnerCredentials,
    ingestEvents,
    ingestTransactions,
    ingestWebhookEvent,
    auditStore,
    approvalStore,
    ownerStore,
    eventStore,
    decisionStore,
    transactionStore,
    businessStore,
    agentStore,
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
export const ingestTransactions = defaultEngine.ingestTransactions
export const ingestWebhookEvent = defaultEngine.ingestWebhookEvent
