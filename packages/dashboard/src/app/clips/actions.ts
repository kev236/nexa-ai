'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getTrendRushBusiness } from '@/lib/business'
import { postClipToYoutube, postClipToInstagram, postClipToTiktok } from '@/lib/clipPosting'
import { resolveVideoInput, getPublicVideoUrl } from '@/lib/videoInput'
import { createAnthropicClient, discoverClipOnce } from '@nexa-ai/permission-engine'
import type { BusinessRecord, ClipRecord, PermissionEngine } from '@nexa-ai/permission-engine'

export type EvaluateClipState = { error?: string; notice?: string } | undefined
export type PostClipState = { error?: string; success?: boolean } | undefined

/**
 * Step 29: tries every platform TrendRush has a real OAuth connection
 * for, using whichever of bytes/publicVideoUrl that platform needs —
 * Instagram only when a public URL exists (see getPublicVideoUrl's own
 * comment), YouTube/TikTok only when bytes exist. A platform with no
 * connection is skipped silently, not an error — connecting is the
 * owner's own future step, not a bug today. One platform failing
 * doesn't stop the others; every outcome (posted / skipped / failed)
 * comes back as one line each, joined into a single notice so a
 * partial failure is never silent.
 */
async function postToConnectedPlatforms(
  engine: PermissionEngine,
  business: BusinessRecord,
  clip: ClipRecord,
  video: { bytes: Buffer; mimeType: string } | undefined,
  publicVideoUrl: string | undefined
): Promise<string[]> {
  const results: string[] = []

  if (video) {
    if (await engine.oauthCredentialStore.get(business.id, 'youtube')) {
      try {
        await postClipToYoutube(engine, business, clip, video)
        results.push('YouTube: posted.')
      } catch (err) {
        results.push(`YouTube: failed — ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (await engine.oauthCredentialStore.get(business.id, 'tiktok')) {
      try {
        await postClipToTiktok(engine, business, clip, video)
        results.push('TikTok: posted.')
      } catch (err) {
        results.push(`TikTok: failed — ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  if (await engine.oauthCredentialStore.get(business.id, 'instagram')) {
    if (publicVideoUrl) {
      try {
        await postClipToInstagram(engine, business, clip, publicVideoUrl)
        results.push('Instagram: posted.')
      } catch (err) {
        results.push(`Instagram: failed — ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (video) {
      results.push('Instagram: skipped — needs a video URL, not an uploaded file (Instagram fetches the video itself).')
    }
  }

  return results
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

  // A video attached up front (a file, or a pasted URL) posts
  // immediately to every connected platform — no second click, no
  // review step, no copyright-risk gate — per the owner's standing
  // instruction ("I don't want anything in Nexa AI to draft, I want it
  // to act fully on its own", logged in README.md's step 27 entry)
  // reconfirmed directly for this specific gate, then extended to
  // Instagram and TikTok alongside YouTube in step 29. Evaluation is
  // already saved at this point regardless of what happens next.
  let video: Awaited<ReturnType<typeof resolveVideoInput>>
  try {
    video = await resolveVideoInput(formData, 'videoFile', 'videoUrl')
  } catch (err) {
    revalidatePath('/clips')
    return {
      error: `Clip evaluated and saved, but reading the attached video failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (!video) {
    revalidatePath('/clips')
    return undefined
  }

  const publicVideoUrl = getPublicVideoUrl(formData, 'videoFile', 'videoUrl')
  const clip = await engine.clipStore.get(clipId)
  if (!clip) {
    revalidatePath('/clips')
    return undefined
  }
  const results = await postToConnectedPlatforms(engine, business, clip, video, publicVideoUrl)

  revalidatePath('/clips')
  return results.length > 0 ? { notice: results.join(' ') } : undefined
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

/** TikTok's equivalent of postClipToYoutubeAction — same shape, needs bytes. */
export async function postClipToTiktokAction(
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
    await postClipToTiktok(engine, business, clip, video)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Posting failed.' }
  }

  revalidatePath('/clips')
  return { success: true }
}

/**
 * Instagram's equivalent — needs a public video URL, not a file, so
 * this form only ever reads the pasted-URL field (see
 * getPublicVideoUrl's own comment for why a file upload can't work
 * here).
 */
export async function postClipToInstagramAction(
  clipId: string,
  _prevState: PostClipState,
  formData: FormData
): Promise<PostClipState> {
  await verifySession()

  try {
    const videoUrl = getPublicVideoUrl(formData, 'videoFile', 'videoUrl')
    if (!videoUrl) return { error: 'Paste a public video URL to post — Instagram fetches the video itself, a file upload has nothing to give it.' }

    const engine = getEngine()
    const business = await getTrendRushBusiness()
    const clip = await engine.clipStore.get(clipId)
    if (!clip) return { error: 'Clip not found.' }
    await postClipToInstagram(engine, business, clip, videoUrl)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Posting failed.' }
  }

  revalidatePath('/clips')
  return { success: true }
}
