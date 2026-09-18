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

// A video hosted somewhere else (an OpenArt generation result, for
// instance) doesn't need to round-trip through the owner's device —
// this fetch runs on the server (Vercel), not a sandboxed dev
// environment, so it can reach hosts a local/sandboxed session can't.
// Owner-only surface (verifySession() gates both callers), so this
// intentionally doesn't block private/internal IP ranges the way a
// public-facing fetch-a-URL endpoint would have to.
const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200MB — generous for a short-form clip, not unbounded

async function readVideoFromUrl(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('That video URL is not valid.')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Video URL must be http(s).')
  }

  const response = await fetch(parsed)
  if (!response.ok) {
    throw new Error(`Could not fetch that video URL: HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? 'video/mp4'
  if (!contentType.startsWith('video/')) {
    throw new Error(`That URL didn't return a video (got "${contentType}").`)
  }
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > MAX_VIDEO_BYTES) {
    throw new Error(`Video is too large (${Math.round(contentLength / 1024 / 1024)}MB, limit 200MB).`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_VIDEO_BYTES) {
    throw new Error(`Video is too large (${Math.round(bytes.length / 1024 / 1024)}MB, limit 200MB).`)
  }
  return { bytes, mimeType: contentType }
}

/** Prefers an uploaded file; falls back to fetching a pasted URL server-side. */
async function resolveVideoInput(
  formData: FormData,
  fileField: string,
  urlField: string
): Promise<{ bytes: Buffer; mimeType: string } | undefined> {
  const file = await readVideoFile(formData, fileField)
  if (file) return file

  const url = formData.get(urlField)
  if (typeof url === 'string' && url.trim()) {
    return readVideoFromUrl(url.trim())
  }
  return undefined
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
  // immediately — no second click, no review step, per the owner's
  // standing instruction. Evaluation is already saved at this point
  // regardless of what happens next.
  try {
    const video = await resolveVideoInput(formData, 'videoFile', 'videoUrl')
    if (video) {
      const clip = await engine.clipStore.get(clipId)
      if (clip) await postClipToYoutube(engine, business, clip, video)
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
