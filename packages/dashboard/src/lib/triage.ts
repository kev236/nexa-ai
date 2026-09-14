import 'server-only'
import { createAnthropicClient, runWaitlistTriageOnce } from '@nexa-ai/permission-engine'
import type { BusinessRecord, RunWaitlistTriageSummary } from '@nexa-ai/permission-engine'
import type { getEngine } from './engine'

const AGENT_KEY = 'waitlist-triage'

/**
 * Shared by the cron route (packages/dashboard/src/app/api/cron/poll)
 * and the Sanity webhook route (.../api/webhooks/sanity) — both just
 * ingest, then call this. Keeps "how the waitlist-triage agent gets
 * run" in one place regardless of what triggered it.
 */
export async function triggerWaitlistTriage(
  engine: ReturnType<typeof getEngine>,
  business: BusinessRecord
): Promise<RunWaitlistTriageSummary> {
  const agent = await engine.agentStore.getByKey(business.id, AGENT_KEY)
  if (!agent) {
    throw new Error(`no agent '${AGENT_KEY}' registered for '${business.slug}' — run db:register-agent first`)
  }
  const llmClient = createAnthropicClient()
  return runWaitlistTriageOnce(engine, llmClient, business.id, agent.id)
}
