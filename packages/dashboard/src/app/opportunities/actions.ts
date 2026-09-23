'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { createAnthropicClient, runOpportunityDiscoveryOnce } from '@nexa-ai/permission-engine'

const DISCOVERY_AGENT_KEY = 'opportunity-discovery'

export type DiscoverOpportunitiesState = { error?: string; proposed?: number } | undefined

/**
 * Step 17: requires the 'opportunity-discovery' agent to already be
 * registered (npm run db:register-agent -- nexa-labs opportunity-discovery
 * "...") — unlike the Creative Agent's optional agentId, this one's
 * required: requestAction() needs a real, active agent to auto-approve
 * against (see engine.ts's shouldAutoApprove). A clear error beats a
 * confusing pending_approval-with-no-agent-attached row.
 */
export async function discoverOpportunities(
  _prevState: DiscoverOpportunitiesState,
  _formData: FormData
): Promise<DiscoverOpportunitiesState> {
  await verifySession()
  const business = await getBusiness()
  const agent = await getEngine().agentStore.getByKey(business.id, DISCOVERY_AGENT_KEY)
  if (!agent) {
    return {
      error: `No '${DISCOVERY_AGENT_KEY}' agent registered for '${business.slug}' — run db:register-agent first.`,
    }
  }

  let proposed: number
  try {
    const llmClient = createAnthropicClient()
    const result = await runOpportunityDiscoveryOnce(getEngine(), llmClient, business.id, agent.id)
    proposed = result.proposed
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Discovery run failed.' }
  }

  revalidatePath('/opportunities')
  return { proposed }
}
