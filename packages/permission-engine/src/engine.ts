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
import type { CampaignStore } from './campaigns/store.js'
import { InMemoryCampaignStore } from './campaigns/memoryStore.js'
import type { ContentConceptStore } from './contentConcepts/store.js'
import { InMemoryContentConceptStore } from './contentConcepts/memoryStore.js'
import type { StoryConceptStore } from './storyConcepts/store.js'
import { InMemoryStoryConceptStore } from './storyConcepts/memoryStore.js'
import type { SocialAccountStore } from './socialAccounts/store.js'
import { InMemorySocialAccountStore } from './socialAccounts/memoryStore.js'
import type { ClipStore } from './clips/store.js'
import { InMemoryClipStore } from './clips/memoryStore.js'
import type { OAuthCredentialStore } from './oauthCredentials/store.js'
import { InMemoryOAuthCredentialStore } from './oauthCredentials/memoryStore.js'
import type { BusinessAdapter, ObservedEvent } from './adapters/types.js'
import { hashPassword, verifyPassword } from './password.js'
import { getExecutor } from './executors/registry.js'
import type { Notifier } from './notifications/notifier.js'
import type { ActionOutcome, ActionRequest } from './types.js'
import type { JsonValue } from './json.js'

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
  /** Step 16: imported/normalized campaign data — see CampaignStore's own doc comment for why this skips requestAction(). */
  campaignStore?: CampaignStore
  /** Step 16: scored creative concepts generated per campaign. */
  contentConceptStore?: ContentConceptStore
  /** Step 19: Sproutlight's generated nursery-rhyme/story concepts. */
  storyConceptStore?: StoryConceptStore
  /** Step 20: real per-platform follower counts, owner-entered — same trust level as OpportunityStore. */
  socialAccountStore?: SocialAccountStore
  /** Step 23: TrendRush's clip evaluations — same trust level as StoryConceptStore. */
  clipStore?: ClipStore
  /** Step 25: OAuth tokens granting real write access to a connected platform account. */
  oauthCredentialStore?: OAuthCredentialStore
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
  campaignStore: CampaignStore
  contentConceptStore: ContentConceptStore
  storyConceptStore: StoryConceptStore
  socialAccountStore: SocialAccountStore
  clipStore: ClipStore
  oauthCredentialStore: OAuthCredentialStore
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
  const campaignStore = deps.campaignStore ?? new InMemoryCampaignStore()
  const contentConceptStore = deps.contentConceptStore ?? new InMemoryContentConceptStore()
  const storyConceptStore = deps.storyConceptStore ?? new InMemoryStoryConceptStore()
  const socialAccountStore = deps.socialAccountStore ?? new InMemorySocialAccountStore()
  const clipStore = deps.clipStore ?? new InMemoryClipStore()
  const oauthCredentialStore = deps.oauthCredentialStore ?? new InMemoryOAuthCredentialStore()
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

    // Every request still gets a pending approval row before anything
    // executes — audit-before-execute (invariant #2) doesn't change here,
    // only how fast a decision gets made.
    const approvalId = await approvalStore.createPending(request, auditId)

    // Step 18: approval policy simplified — money is the one thing that
    // still needs the owner. Everything else auto-executes the moment an
    // active agent requests it; see shouldAutoApprove(). This replaces
    // step 11's opt-in autonomy-level-2 system (a narrow, per-agent,
    // confidence-gated promotion) — the owner decided the narrow version
    // wasn't worth the friction and asked for the reverse default.
    // "Audit before execute" (invariant #2) is untouched: every action,
    // auto- or owner-approved, still gets a pending approval row and an
    // audit record first. Fails closed on any error (invariant #8): a
    // broken check never silently promotes a request to auto-approved,
    // it just falls back to the safer, slower path.
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

  /**
   * Step 18: auto-approve everything except money. An agent must still
   * exist and be active — a deleted or disabled agent gets no auto-
   * approval, same as before — but there's no more per-agent opt-in
   * (autonomyLevel/autoApproveMinConfidence, step 11) and no more
   * spending-cap-gated auto-approval (step 13): `expectedCost` being
   * present is now itself the sole reason to stop and wait, full stop,
   * regardless of amount, confidence, or agent config. A cap that only
   * ever gated auto-approval has nothing left to gate once money never
   * auto-approves — see money/ in this package's git history for the
   * removed spendingLimit module, and the step 18 README section for
   * why it wasn't reworked to also gate owner approval: the owner
   * clicking Approve on a costed request *is* the safety control now,
   * the same way it already is for every other costed decision they've
   * ever made through this dashboard.
   */
  async function shouldAutoApprove(request: ActionRequest): Promise<boolean> {
    const agent = await agentStore.getById(request.agentId)
    if (!agent || !agent.active) return false
    return !request.expectedCost
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
    // Before this, an executor that threw left nothing behind: the
    // approval already says 'approved', but recordExecuted() never runs,
    // so the audit_log row stays stuck at 'requested' forever — not
    // 'abandoned' either, since reapAbandonedRequests() explicitly skips
    // any row that already has an approval (see its own comment). A real
    // upload failure (expired token, a network blip, Google's API
    // erroring) left a permanently stuck, invisible row and an unhandled
    // rejection for the caller. recordFailed() gives that outcome an
    // actual terminal state instead of falling through the cracks
    // between the four states that already existed — still rethrown so
    // every existing caller's try/catch keeps working exactly as before.
    let result: JsonValue
    try {
      result = await executor(approval.request.payload, {
        businessId: approval.request.businessId,
        agentId: approval.request.agentId,
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      await auditStore.recordFailed(approval.auditId, reason)
      throw err
    }
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
    campaignStore,
    contentConceptStore,
    storyConceptStore,
    socialAccountStore,
    clipStore,
    oauthCredentialStore,
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
