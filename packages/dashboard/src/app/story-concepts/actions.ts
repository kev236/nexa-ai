'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getSproutlightBusiness } from '@/lib/business'
import { postStoryConceptToYoutube } from '@/lib/storyConceptPosting'
import { resolveVideoInput } from '@/lib/videoInput'
import { createAnthropicClient, generateStoryConceptOnce } from '@nexa-ai/permission-engine'

export type GenerateStoryConceptState = { error?: string } | undefined
export type PostStoryConceptState = { error?: string; success?: boolean } | undefined

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

/** Bound to a conceptId per card on the Sproutlight page — posts an already-generated concept once a video is attached. */
export async function postStoryConceptToYoutubeAction(
  conceptId: string,
  _prevState: PostStoryConceptState,
  formData: FormData
): Promise<PostStoryConceptState> {
  await verifySession()

  try {
    const video = await resolveVideoInput(formData, 'videoFile', 'videoUrl')
    if (!video) return { error: 'Attach a video file or paste a video URL to post.' }

    const engine = getEngine()
    const business = await getSproutlightBusiness()
    const concept = await engine.storyConceptStore.get(conceptId)
    if (!concept) return { error: 'Concept not found.' }
    await postStoryConceptToYoutube(engine, business, concept, video)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Posting failed.' }
  }

  revalidatePath('/story-concepts')
  return { success: true }
}
