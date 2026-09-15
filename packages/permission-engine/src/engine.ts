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
import type { OpportunityStore } from './opportunities/store.js'
import { InMemoryOpportunityStore } from './opportunities/memoryStore.js'
import type { BusinessAdapter, ObservedEvent } from './adapters/types.js'
import { hashPassword, verifyPassword } from './password.js'
import { getExecutor } from './executors/registry.js'
import type { Notifier } from './notifications/notifier.js'
import { readSpendingLimitConfig } from './money/spendingLimit.js'
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
  /** Step 15: no agent touches this — pure owner-authored notes, same trust level as OwnerStore. */
  opportunityStore?: OpportunityStore
  /** Step 10: optional — no notifier configured means no attempt, not an error. */
  notifier?: Notifier
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
  /**
   * Step 12: readme.md's "Failure and retries" — sweeps audit_log rows
   * still 'requested' with no matching approval ever created, older than
   * `olderThanMs`, and marks them 'abandoned'. Meant to be called
   * periodically (the dashboard's cron route does, alongside triage) —
   * not part of requestAction()'s own flow, since the crash this recovers
   * from is exactly a process dying mid-requestAction, so nothing inside
   * that same call could ever detect it.
   */
  reapAbandonedRequests(olderThanMs?: number, limit?: number): Promise<{ abandoned: number }>
  auditStore: AuditLogStore
  approvalStore: ApprovalStore
  ownerStore: OwnerStore
  eventStore: EventStore
  decisionStore: DecisionStore
  transactionStore: TransactionStore
  businessStore: BusinessStore
  agentStore: AgentStore
  opportunityStore: OpportunityStore
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
  const opportunityStore = deps.opportunityStore ?? new InMemoryOpportunityStore()
  const notifier = deps.notifier

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

    // Step 11: autonomy level 2 — an owner can pre-authorize a narrow,
    // proven action type in config (an agent's autonomyLevel plus a
    // confidence threshold), skipping the wait for that specific
    // narrow case. "Nobody but the owner approves anything" (readme.md)
    // still holds here: the owner made this decision in advance, by
    // setting the policy, not the system deciding on its own — see
    // shouldAutoApprove(). Fails closed on any error (readme.md
    // invariant #8): a broken check never silently promotes a request
    // to auto-approved, it just falls back to the safer, slower path.
    let autoApprove = false
    try {
      autoApprove = await shouldAutoApprove(request)
    } catch (err) {
      console.error('autonomy check failed, falling back to pending_approval:', err)
    }

    if (autoApprove) {
      // No "needs your approval" notification for something that's
      // already been decided — resolveApproval runs the exact same
      // execute path a human's Approve click would, just triggered
      // here instead of waiting for one. resolvedBy stays unset,
      // which is how the audit trail distinguishes this from a real
      // human resolution (see ApprovalStore.resolve()'s own comment).
      return resolveApproval(approvalId, 'approved')
    }

    // Step 10: best-effort — a notification failure must never affect
    // whether the request itself succeeded; the approval already exists
    // and is already queryable regardless of whether anyone got emailed
    // about it. Caught and logged here, not inside the notifier, so a
    // fake notifier in tests can still throw predictably.
    if (notifier) {
      try {
        await notifier.notifyPendingApproval(request, approvalId)
      } catch (err) {
        console.error('failed to notify owner of pending approval:', err)
      }
    }

    return { status: 'pending_approval', auditId, approvalId }
  }

  async function shouldAutoApprove(request: ActionRequest): Promise<boolean> {
    const agent = await agentStore.getById(request.agentId)
    if (!agent || !agent.active || agent.autonomyLevel < 2) return false

    const config = agent.config
    const minConfidence =
      typeof config === 'object' && config !== null && !Array.isArray(config) && typeof config.autoApproveMinConfidence === 'number'
        ? config.autoApproveMinConfidence
        : undefined
    // Both autonomyLevel >= 2 AND an explicit threshold must be set —
    // bumping the level alone does nothing, on purpose. Two deliberate
    // config values, not one flag, so promoting an agent can't happen
    // by accident.
    if (minConfidence === undefined) return false
    if (request.confidence === undefined) return false
    if (request.confidence < minConfidence) return false

    // Step 13: a spending cap gates auto-approval specifically, not the
    // normal pending_approval path — a human already sees the cost
    // before clicking Approve, so a cap only needs to stop the system
    // from spending unsupervised. No expectedCost on this request means
    // nothing to cap; skip straight to true.
    if (request.expectedCost) {
      return isWithinSpendingLimit(request)
    }
    return true
  }

  async function isWithinSpendingLimit(request: ActionRequest): Promise<boolean> {
    if (!request.expectedCost) return true
    const config = await businessStore.getConfig(request.businessId)
    const limit = readSpendingLimitConfig(config)
    if (!limit) return true // no cap configured — nothing to enforce

    if (limit.currency !== request.expectedCost.currency) {
      // Fail closed (invariant #8): a cap in a different currency than
      // this request is ambiguous, not "no cap" — never guess an FX rate.
      return false
    }

    const sinceMs = limit.windowHours * 60 * 60 * 1000
    // readme.md's Money section: "spend is measured against the ledger
    // plus outstanding unconsumed grants." By this point in
    // requestAction(), this request's own approval already exists as a
    // 'pending' grant (createPending() ran before shouldAutoApprove()
    // does), so sumPendingCost already includes it — no need to add
    // request.expectedCost.amountCents a second time. This is also what
    // makes the check race-safe: two concurrent requests each create
    // their own pending row first, so whichever checks second always
    // sees the other's committed amount already counted.
    const [spent, pending] = await Promise.all([
      auditStore.sumExecutedCost(request.businessId, limit.currency, sinceMs),
      approvalStore.sumPendingCost(request.businessId, limit.currency),
    ])
    return spent + pending <= limit.amountCents
  }

  async function resolveApproval(
    approvalId: string,
    decision: 'approved' | 'denied',
    resolvedBy?: string
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

  async function reapAbandonedRequests(
    olderThanMs = DEFAULT_ABANDON_AFTER_MS,
    limit = 100
  ): Promise<{ abandoned: number }> {
    const stale = await auditStore.listStaleRequested(olderThanMs, limit)
    let abandoned = 0
    for (const record of stale) {
      const approval = await approvalStore.getByAuditId(record.id)
      // A pending approval exists — this is just an ordinary item sitting
      // in the queue the owner hasn't gotten to yet, not a crash. Leave
      // it alone; only a request that never got an approval row at all
      // is the window this recovers from (see the migration's comment).
      if (approval) continue
      await auditStore.recordAbandoned(
        record.id,
        `no approval record was ever created within ${olderThanMs}ms of the request — likely a crashed run`
      )
      abandoned++
    }
    return { abandoned }
  }

  return {
    requestAction,
    resolveApproval,
    listPendingApprovals,
    verifyOwnerCredentials,
    ingestEvents,
    ingestTransactions,
    ingestWebhookEvent,
    reapAbandonedRequests,
    auditStore,
    approvalStore,
    ownerStore,
    eventStore,
    decisionStore,
    transactionStore,
    businessStore,
    agentStore,
    opportunityStore,
  }
}

// A real scrypt hash of an unguessed, fixed value — generated the normal
// way so its format is guaranteed correct — used only so a lookup miss
// and a wrong password take the same code path through verifyPassword
// rather than one returning early.
const DUMMY_HASH_FOR_TIMING = hashPassword('nexa-ai-dummy-password-for-timing-safety-only')

// 10 minutes: comfortably longer than the real gap between
// recordRequested() and createPending() (milliseconds, normally) ever
// takes, so this never mistakes an in-flight request for an abandoned
// one — only a genuinely crashed run leaves that gap open this long.
const DEFAULT_ABANDON_AFTER_MS = 10 * 60 * 1000

const defaultEngine = createPermissionEngine()

export const requestAction = defaultEngine.requestAction
export const resolveApproval = defaultEngine.resolveApproval
export const listPendingApprovals = defaultEngine.listPendingApprovals
export const verifyOwnerCredentials = defaultEngine.verifyOwnerCredentials
export const ingestEvents = defaultEngine.ingestEvents
export const ingestTransactions = defaultEngine.ingestTransactions
export const ingestWebhookEvent = defaultEngine.ingestWebhookEvent
export const reapAbandonedRequests = defaultEngine.reapAbandonedRequests
