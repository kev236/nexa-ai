'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getTrendRushBusiness } from '@/lib/business'
import { postClipToYoutube } from '@/lib/clipPosting'
import { resolveVideoInput } from '@/lib/videoInput'
import { createAnthropicClient, discoverClipOnce } from '@nexa-ai/permission-engine'

export type EvaluateClipState = { error?: string; notice?: string } | undefined
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
  // immediately — no second click, no review step, per the owner's
  // standing instruction. Evaluation is already saved at this point
  // regardless of what happens next.
  //
  // But that no-review-step shortcut only applies at low copyright
  // risk — postClipYoutube.ts's own executor comment already says so
  // ("only copyrightRisk === 'low' clips ever reach requestAction() for
  // this actionType without the owner clicking a button first"); this
  // is that gate actually being enforced, not just documented. Above
  // low risk, the video that was attached here is *not* posted (and
  // isn't kept anywhere — this request's memory is the only place it
  // ever existed), so re-attach it via the per-clip "Post to YouTube"
  // button below once you've reviewed the risk badge and reasoning.
  try {
    const video = await resolveVideoInput(formData, 'videoFile', 'videoUrl')
    if (video) {
      const clip = await engine.clipStore.get(clipId)
      if (clip?.copyrightRisk === 'low') {
        await postClipToYoutube(engine, business, clip, video)
      } else if (clip) {
        revalidatePath('/clips')
        return {
          notice: `Clip evaluated — copyright risk: ${clip.copyrightRisk}. Videos only auto-post at low risk, so the file/URL you attached wasn't used — review it below and re-attach it to "Post to YouTube" if you still want to post it.`,
        }
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
