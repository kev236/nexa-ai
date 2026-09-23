import 'server-only'
import { createAnthropicClient, createSanityReadClient, runBlogGenerationOnce } from '@nexa-ai/permission-engine'
import type { BusinessRecord, RunBlogGenerationResult } from '@nexa-ai/permission-engine'
import type { getEngine } from './engine'

const AGENT_KEY = 'blog-writer'

/**
 * Same "shared by whatever triggers it" reasoning as triggerWaitlistTriage
 * in triage.ts — the cron route calls this; nothing else does yet, but
 * keeping the logic out of the route itself means an operator's manual
 * CLI run (if one gets built later) calls the exact same code.
 */
export async function triggerBlogGeneration(
  engine: ReturnType<typeof getEngine>,
  business: BusinessRecord
): Promise<RunBlogGenerationResult> {
  const agent = await engine.agentStore.getByKey(business.id, AGENT_KEY)
  if (!agent) {
    throw new Error(`no agent '${AGENT_KEY}' registered for '${business.slug}' — run db:register-agent first`)
  }

  const llmClient = createAnthropicClient()
  const sanityReadClient = createSanityReadClient()
  return runBlogGenerationOnce(engine, llmClient, sanityReadClient, business.id, agent.id)
}
