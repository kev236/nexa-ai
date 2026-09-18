'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getTrendRushBusiness } from '@/lib/business'
import { postClipToYoutube } from '@/lib/clipPosting'
import { resolveVideoInput } from '@/lib/videoInput'
import { createAnthropicClient, discoverClipOnce } from '@nexa-ai/permission-engine'

export type EvaluateClipState = { error?: string } | undefined
export type PostClipState = { error?: string; success?: boolean } | undefined

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

  const engine = getEngine()
  let business
  let clipId: string

  try {
    business = await getTrendRushBusiness()
    const llmClient = createAnthropicClient()
    const result = await discoverClipOnce(
      engine.clipStore,
      llmClient,
      business.id,
      sourceDescription.trim(),
      typeof sourceUrl === 'string' && sourceUrl.trim() ? sourceUrl.trim() : undefined
    )
    clipId = result.id
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Evaluation failed.' }
  }

  // A video attached up front (a file, or a pasted URL) posts
  // immediately — no second click, no review step, no copyright-risk
  // gate — per the owner's standing instruction ("I don't want anything
  // in Nexa AI to draft, I want it to act fully on its own", logged in
  // README.md's step 27 entry) reconfirmed directly for this specific
  // gate. Evaluation is already saved at this point regardless of what
  // happens next. postClipYoutube.ts's own executor comment has been
  // updated to match — nothing gates this action anymore, at any risk
  // level, the same way postClipToYoutubeAction below never did.
  try {
    const video = await resolveVideoInput(formData, 'videoFile', 'videoUrl')
    if (video) {
      const clip = await engine.clipStore.get(clipId)
      if (clip) {
        await postClipToYoutube(engine, business, clip, video)
      }
    }
  } catch (err) {
    revalidatePath('/clips')
    return {
      error: `Clip evaluated and saved, but posting to YouTube failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  revalidatePath('/clips')
  return undefined
}

/** Bound to a clipId per card on the Clips page — posts an already-evaluated clip once a video is attached. */
export async function postClipToYoutubeAction(
  clipId: string,
  _prevState: PostClipState,
  formData: FormData
): Promise<PostClipState> {
  await verifySession()

  try {
    const video = await resolveVideoInput(formData, 'videoFile', 'videoUrl')
    if (!video) return { error: 'Attach a video file or paste a video URL to post.' }

    const engine = getEngine()
    const business = await getTrendRushBusiness()
    const clip = await engine.clipStore.get(clipId)
    if (!clip) return { error: 'Clip not found.' }
    await postClipToYoutube(engine, business, clip, video)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Posting failed.' }
  }

  revalidatePath('/clips')
  return { success: true }
}
