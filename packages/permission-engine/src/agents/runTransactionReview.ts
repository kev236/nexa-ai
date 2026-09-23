import type { PermissionEngine } from '../engine.js'
import type { MessagesClient } from '../llm/client.js'
import type { JsonValue } from '../json.js'
import { reviewTransaction } from './transactionReviewAgent.js'

export type RunTransactionReviewOptions = {
  /** Stops after this many transactions have been reviewed in this run. */
  maxActions?: number
  /** Stops once this many milliseconds of wall-clock time have elapsed. */
  timeoutMs?: number
}

export type RunTransactionReviewSummary = {
  /** Every transaction examined this run, flagged or not — reviewed - flagged were judged routine. */
  reviewed: number
  /** Of those reviewed, how many produced an alert submitted for owner approval. */
  flagged: number
  /** Set only when the run stopped early — same readme.md "Agents" shape as runWaitlistTriageOnce. */
  stoppedReason?: 'maxActions' | 'timeout'
}

const DEFAULT_MAX_ACTIONS = 20
const DEFAULT_TIMEOUT_MS = 60_000

/**
 * The transaction-review agent's one run: every unreviewed transaction
 * (transactions.decision_id IS NULL — TransactionStore.listUnreviewed())
 * gets a review decision recorded, and — only when the model decides it's
 * worth flagging — a drafted alert submitted as a 'send_email' action to
 * the first registered owner. Since step 18, that alert isn't money, so
 * it sends the moment it's drafted — no owner click required, though it
 * still goes to the owner's own inbox, not a customer. A routine
 * transaction gets a decision recorded (so it's not reviewed again) but
 * no requestAction() call at all — there's nothing to send about "this
 * was fine."
 *
 * Bounded the same way runWaitlistTriageOnce is (readme.md's "Agents"
 * section: every run needs a wall-clock timeout and a max action count).
 * A token budget is NOT enforced here either, for the same reason that
 * function's own comment gives — completeWithTool()/reviewTransaction()
 * don't surface per-call usage to sum against one.
 */
export async function runTransactionReviewOnce(
  engine: PermissionEngine,
  llmClient: MessagesClient,
  businessId: string,
  agentId: string,
  ownerEmail: string,
  options: RunTransactionReviewOptions = {}
): Promise<RunTransactionReviewSummary> {
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  const transactions = await engine.transactionStore.listUnreviewed(businessId, 500)
  let reviewed = 0
  let flagged = 0

  for (const transaction of transactions) {
    if (reviewed >= maxActions) {
      return { reviewed, flagged, stoppedReason: 'maxActions' }
    }
    if (Date.now() >= deadline) {
      return { reviewed, flagged, stoppedReason: 'timeout' }
    }

    const result = await reviewTransaction(llmClient, transaction)
    const subject = `Nexa AI: ${transaction.type} worth a look`
    // transaction-review.md's own tool schema doesn't require draftAlert
    // even when worthFlagging is true (unlike clipDiscoveryAgent.ts /
    // storyConceptAgent.ts, this agent has no response validation at
    // all) — a real response shape this model can and does return. The
    // old code trusted draftAlert being present whenever worthFlagging
    // was true; when it wasn't, requestAction() never fired, but the
    // transaction still got linkDecision()'d as reviewed — the one
    // transaction the model itself judged worth an alert silently never
    // got one, with no way to revisit it. Falling back to a body that
    // says exactly that, rather than sending nothing, is what actually
    // keeps this agent's own purpose intact.
    let expectedResult: JsonValue
    let alertBody: string | undefined
    if (result.worthFlagging) {
      alertBody =
        result.draftAlert?.trim() ||
        `Nexa AI flagged this ${transaction.type} as worth a look but didn't draft alert text. Reasoning: ${result.reasoning}`
      expectedResult = { to: ownerEmail, subject, body: alertBody }
    } else {
      expectedResult = { flagged: false }
    }

    const decisionId = await engine.decisionStore.record({
      businessId,
      agentId,
      actionType: result.worthFlagging ? 'send_email' : 'none',
      reasoning: result.reasoning,
      expectedResult,
      confidence: result.confidence,
    })
    await engine.transactionStore.linkDecision(transaction.id, decisionId)

    if (result.worthFlagging && alertBody) {
      await engine.requestAction({
        businessId,
        agentId,
        actionType: 'send_email',
        payload: { to: ownerEmail, subject, body: alertBody },
        reasoning: result.reasoning,
        expectedResult,
        // Recorded for the audit trail — see runWaitlistTriage.ts's
        // identical comment for why step 18's auto-approve policy
        // doesn't read this anymore.
        confidence: result.confidence,
      })
      flagged++
    }
    reviewed++
  }

  return { reviewed, flagged }
}
