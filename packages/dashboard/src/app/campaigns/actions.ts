'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { createAnthropicClient, importCampaignOnce, generateConceptsOnce } from '@nexa-ai/permission-engine'
import { resolveCampaignBusinessSlug } from './business'

const CREATIVE_AGENT_KEY = 'creative-agent'

export type CampaignFormState = { error?: string } | undefined

export async function createCampaign(
  _prevState: CampaignFormState,
  formData: FormData
): Promise<CampaignFormState> {
  await verifySession()
  const rawInput = formData.get('rawInput')
  const externalId = formData.get('externalId')
  const businessSlug = resolveCampaignBusinessSlug(formData.get('business')?.toString())

  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    return { error: 'Paste the campaign brief text.' }
  }

  let campaignId: string
  try {
    const business = await getBusiness(businessSlug)
    const llmClient = createAnthropicClient()
    const result = await importCampaignOnce(
      getEngine(),
      llmClient,
      business.id,
      rawInput.trim(),
      typeof externalId === 'string' && externalId.trim() ? externalId.trim() : undefined
    )
    campaignId = result.campaignId
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Import failed.' }
  }

  revalidatePath('/campaigns')
  redirect(`/campaigns/${campaignId}`)
}

export async function generateConcepts(campaignId: string): Promise<void> {
  await verifySession()
  const engine = getEngine()
  // The campaign's own business, not a hardcoded one — this used to
  // always resolve Promote.fun regardless of which business the campaign
  // actually belonged to, harmless only because every campaign was
  // Promote.fun's until Nexa Labs' own campaigns existed too.
  const campaign = await engine.campaignStore.get(campaignId)
  if (!campaign) {
    throw new Error(`no campaign with id ${campaignId}`)
  }
  const llmClient = createAnthropicClient()
  const agent = await engine.agentStore.getByKey(campaign.businessId, CREATIVE_AGENT_KEY)
  await generateConceptsOnce(engine, llmClient, campaign.businessId, campaignId, agent?.id)
  revalidatePath(`/campaigns/${campaignId}`)
}

export async function markConceptRunReviewed(runId: string, campaignId: string): Promise<void> {
  await verifySession()
  await getEngine().contentConceptStore.markReviewed(runId)
  revalidatePath(`/campaigns/${campaignId}`)
}

export async function setCampaignStatus(
  id: string,
  status: 'active' | 'paused' | 'archived'
): Promise<void> {
  await verifySession()
  await getEngine().campaignStore.setStatus(id, status)
  revalidatePath('/campaigns')
  revalidatePath(`/campaigns/${id}`)
}
