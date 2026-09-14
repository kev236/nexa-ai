import type { PermissionEngine } from '../engine.js'
import type { MessagesClient } from '../llm/client.js'
import { triageEvent } from './waitlistTriageAgent.js'

export type RunWaitlistTriageOptions = {
  /** Stops after this many events have been triaged in this run. */
  maxActions?: number
  /** Stops once this many milliseconds of wall-clock time have elapsed. */
  timeoutMs?: number
}

export type RunWaitlistTriageSummary = {
  triaged: number
  skipped: number
  /** Set only when the run stopped early — readme.md's "Agents" section: a run that hits a limit stops and reports, it doesn't push through more cheaply. */
  stoppedReason?: 'maxActions' | 'timeout'
}

const DEFAULT_MAX_ACTIONS = 20
const DEFAULT_TIMEOUT_MS = 60_000

/**
 * The waitlist-triage agent's one run: every un-triaged event with an
 * email address in its payload gets a drafted reply submitted as a
 * 'send_email' action for owner approval (step 6) — default autonomy
 * level 1 still applies, nothing sends without an explicit approval.
 * Extracted here (step 8) so db/runWaitlistTriage.mjs (a manual CLI run)
 * and the dashboard's scheduled cron route call the exact same logic —
 * previously only the script had it, so the two would have drifted.
 *
 * Bounded per readme.md's "Agents" section (every run needs a wall-clock
 * timeout and a max action count): a run that hits either limit stops
 * and reports rather than continuing — the next scheduled run picks up
 * where this one left off, since un-triaged events are exactly what it
 * looks for again. A token budget is NOT enforced here yet — that needs
 * completeWithTool()/triageEvent() to surface per-call usage first,
 * which they don't; deliberately not built in this pass, not forgotten.
 */
export async function runWaitlistTriageOnce(
  engine: PermissionEngine,
  llmClient: MessagesClient,
  businessId: string,
  agentId: string,
  options: RunWaitlistTriageOptions = {}
): Promise<RunWaitlistTriageSummary> {
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  const events = await engine.eventStore.listByBusiness(businessId, 500)
  let triaged = 0
  let skipped = 0

  for (const event of events) {
    if (triaged >= maxActions) {
      return { triaged, skipped, stoppedReason: 'maxActions' }
    }
    if (Date.now() >= deadline) {
      return { triaged, skipped, stoppedReason: 'timeout' }
    }

    if (await engine.decisionStore.hasDecisionForEvent(event.id)) {
      skipped++
      continue
    }

    const payload = event.payload
    const to =
      typeof payload === 'object' && payload !== null && !Array.isArray(payload) && typeof payload.email === 'string'
        ? payload.email
        : undefined
    if (!to) {
      skipped++
      continue
    }

    const result = await triageEvent(llmClient, event)
    const subject =
      event.type === 'waitlist_signup' ? "You're on the Nexa Labs waitlist" : 'Re: your message to Nexa Labs'

    await engine.decisionStore.record({
      businessId,
      agentId,
      eventId: event.id,
      actionType: 'send_email',
      reasoning: result.reasoning,
      expectedResult: { to, subject, body: result.draftReply },
      confidence: result.confidence,
    })

    await engine.requestAction({
      businessId,
      agentId,
      actionType: 'send_email',
      payload: { to, subject, body: result.draftReply },
      reasoning: result.reasoning,
      expectedResult: { to, subject, body: result.draftReply },
    })

    triaged++
  }

  return { triaged, skipped }
}
