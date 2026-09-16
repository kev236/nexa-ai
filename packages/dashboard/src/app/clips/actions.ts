'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getTrendRushBusiness } from '@/lib/business'
import { createAnthropicClient, discoverClipOnce } from '@nexa-ai/permission-engine'

export type EvaluateClipState = { error?: string } | undefined

export async function evaluateClipAction(
  _prevState: EvaluateClipState,
  formData: FormData
): Promise<EvaluateClipState> {
  await verifySession()
  const sourceDescription = formData.get('sourceDescription')
  const sourceUrl = formData.get('sourceUrl')

  if (typeof sourceDescription !== 'string' || !sourceDescription.trim()) {
    return { error: 'Describe the clip — what happens in it, who it features.' }
  }

  try {
    const business = await getTrendRushBusiness()
    const llmClient = createAnthropicClient()
    await discoverClipOnce(
      getEngine().clipStore,
      llmClient,
      business.id,
      sourceDescription.trim(),
      typeof sourceUrl === 'string' && sourceUrl.trim() ? sourceUrl.trim() : undefined
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Evaluation failed.' }
  }

  revalidatePath('/clips')
  return undefined
}
