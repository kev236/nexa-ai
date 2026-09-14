import type { PermissionEngine } from '../engine.js'
import type { MessagesClient } from '../llm/client.js'
import { triageEvent } from './waitlistTriageAgent.js'

export type RunWaitlistTriageSummary = { triaged: number; skipped: number }

/**
 * The waitlist-triage agent's one run: every un-triaged event with an
 * email address in its payload gets a drafted reply submitted as a
 * 'send_email' action for owner approval (step 6) — default autonomy
 * level 1 still applies, nothing sends without an explicit approval.
 * Extracted here (step 8) so db/runWaitlistTriage.mjs (a manual CLI run)
 * and the dashboard's scheduled cron route call the exact same logic —
 * previously only the script had it, so the two would have drifted.
 */
export async function runWaitlistTriageOnce(
  engine: PermissionEngine,
  llmClient: MessagesClient,
  businessId: string,
  agentId: string
): Promise<RunWaitlistTriageSummary> {
  const events = await engine.eventStore.listByBusiness(businessId, 500)
  let triaged = 0
  let skipped = 0

  for (const event of events) {
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
