'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getTrendRushBusiness } from '@/lib/business'
import { postClipToYoutube } from '@/lib/clipPosting'
import { createAnthropicClient, discoverClipOnce } from '@nexa-ai/permission-engine'

export type EvaluateClipState = { error?: string } | undefined
export type PostClipState = { error?: string; success?: boolean } | undefined

/** Absent/empty file inputs still show up in FormData as a zero-size File — treated the same as "no file attached". */
async function readVideoFile(formData: FormData, field: string): Promise<{ bytes: Buffer; mimeType: string } | undefined> {
  const file = formData.get(field)
  if (!(file instanceof File) || file.size === 0) return undefined
  return { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type || 'video/mp4' }
}

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

  // A video attached up front posts immediately — no second click, no
  // review step, per the owner's standing instruction. Evaluation is
  // already saved at this point regardless of what happens next.
  const video = await readVideoFile(formData, 'videoFile')
  if (video) {
    try {
      const clip = await engine.clipStore.get(clipId)
      if (clip) await postClipToYoutube(engine, business, clip, video)
    } catch (err) {
      revalidatePath('/clips')
      return {
        error: `Clip evaluated and saved, but posting to YouTube failed: ${err instanceof Error ? err.message : String(err)}`,
      }
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
  const video = await readVideoFile(formData, 'videoFile')
  if (!video) return { error: 'Attach a video file to post.' }

  try {
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
