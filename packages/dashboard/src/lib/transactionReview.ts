import 'server-only'
import { createAnthropicClient, runTransactionReviewOnce } from '@nexa-ai/permission-engine'
import type { BusinessRecord, RunTransactionReviewSummary } from '@nexa-ai/permission-engine'
import type { getEngine } from './engine'

const AGENT_KEY = 'transaction-review'

/**
 * Step 14's second agent, called from the cron route the same way
 * triggerWaitlistTriage() is — see that file. Not registered is not a
 * fatal error: unlike the waitlist-triage agent (which every
 * deployment needs), reviewing transactions only makes sense once
 * Stripe or the crypto wallet is actually configured, so a business
 * that hasn't registered this agent yet just skips this step, not the
 * whole cron run.
 */
export async function triggerTransactionReview(
  engine: ReturnType<typeof getEngine>,
  business: BusinessRecord
): Promise<RunTransactionReviewSummary | { skipped: string }> {
  const agent = await engine.agentStore.getByKey(business.id, AGENT_KEY)
  if (!agent) {
    return { skipped: `no agent '${AGENT_KEY}' registered for '${business.slug}' — run db:register-agent to enable it` }
  }
  const owners = await engine.ownerStore.listAll()
  const ownerEmail = owners[0]?.email
  if (!ownerEmail) {
    return { skipped: 'no owner account exists to send alerts to' }
  }
  const llmClient = createAnthropicClient()
  return runTransactionReviewOnce(engine, llmClient, business.id, agent.id, ownerEmail)
}
