'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getSproutlightBusiness } from '@/lib/business'
import { createAnthropicClient, generateStoryConceptOnce } from '@nexa-ai/permission-engine'

export type GenerateStoryConceptState = { error?: string } | undefined

export async function generateStoryConcept(
  _prevState: GenerateStoryConceptState,
  formData: FormData
): Promise<GenerateStoryConceptState> {
  await verifySession()
  const theme = formData.get('theme')
  const format = formData.get('format')

  if (typeof theme !== 'string' || !theme.trim()) {
    return { error: 'Enter a theme for the concept.' }
  }
  if (format !== 'song' && format !== 'story') {
    return { error: 'Choose a format.' }
  }

  try {
    const business = await getSproutlightBusiness()
    const llmClient = createAnthropicClient()
    await generateStoryConceptOnce(getEngine().storyConceptStore, llmClient, business.id, theme.trim(), format)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Generation failed.' }
  }

  revalidatePath('/story-concepts')
  return undefined
}
