'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getPromoteFunBusiness } from '@/lib/business'
import { createAnthropicClient, importCampaignOnce, generateConceptsOnce } from '@nexa-ai/permission-engine'

const CREATIVE_AGENT_KEY = 'creative-agent'

export type CampaignFormState = { error?: string } | undefined

export async function createCampaign(
  _prevState: CampaignFormState,
  formData: FormData
): Promise<CampaignFormState> {
  await verifySession()
  const rawInput = formData.get('rawInput')
  const externalId = formData.get('externalId')

  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    return { error: 'Paste the campaign brief text.' }
  }

  let campaignId: string
  try {
    const business = await getPromoteFunBusiness()
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
  const business = await getPromoteFunBusiness()
  const llmClient = createAnthropicClient()
  const agent = await getEngine().agentStore.getByKey(business.id, CREATIVE_AGENT_KEY)
  await generateConceptsOnce(getEngine(), llmClient, business.id, campaignId, agent?.id)
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
