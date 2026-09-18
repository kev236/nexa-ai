import type { JsonValue } from '../json.js'
import type { ClipStore } from '../clips/store.js'
import type { OAuthCredentialStore } from '../oauthCredentials/store.js'
import type { YouTubeUploadClient } from '../adapters/youtubeUploadAdapter.js'
import { createYouTubeUploadHttpClient } from '../adapters/youtubeUploadAdapter.js'
import { createPostgresClipStore } from '../clips/postgresStore.js'
import { createPostgresOAuthCredentialStore } from '../oauthCredentials/postgresStore.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

type PostClipYoutubePayload = {
  clipId: string
  title: string
  description: string
  tags: string[]
  videoBase64: string
  mimeType: string
  privacyStatus: 'public' | 'unlisted' | 'private'
}

function assertPayload(payload: JsonValue): PostClipYoutubePayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new TypeError('post_clip_youtube payload must be an object')
  }
  const p = payload as Record<string, unknown>
  if (typeof p.clipId !== 'string' || !p.clipId) throw new TypeError('post_clip_youtube payload missing clipId')
  if (typeof p.title !== 'string' || !p.title) throw new TypeError('post_clip_youtube payload missing title')
  if (typeof p.description !== 'string') throw new TypeError('post_clip_youtube payload missing description')
  if (!Array.isArray(p.tags) || !p.tags.every((t) => typeof t === 'string')) {
    throw new TypeError('post_clip_youtube payload tags must be a string array')
  }
  if (typeof p.videoBase64 !== 'string' || !p.videoBase64) {
    throw new TypeError('post_clip_youtube payload missing videoBase64')
  }
  if (typeof p.mimeType !== 'string' || !p.mimeType) throw new TypeError('post_clip_youtube payload missing mimeType')
  if (p.privacyStatus !== 'public' && p.privacyStatus !== 'unlisted' && p.privacyStatus !== 'private') {
    throw new TypeError('post_clip_youtube payload privacyStatus must be public, unlisted, or private')
  }
  return {
    clipId: p.clipId,
    title: p.title,
    description: p.description,
    tags: p.tags as string[],
    videoBase64: p.videoBase64,
    mimeType: p.mimeType,
    privacyStatus: p.privacyStatus,
  }
}

/** 60s of slack before the stored expiry — avoids starting an upload with a token that expires mid-request. */
const REFRESH_SKEW_MS = 60_000

/**
 * Step 27: the repost executor migration 0018's own comment flagged as
 * missing — approving a post_clip_youtube decision uploads a real video
 * to TrendRush's connected YouTube channel. Scoped to YouTube only
 * (Instagram/TikTok posting APIs both gate publishing behind their own
 * developer-app review process — a real external dependency, not
 * something this code can shortcut); OAuthCredentialStore already has
 * room for those platforms whenever that review clears.
 *
 * No copyright-risk gate anywhere in this path (dashboard's
 * clips/actions.ts and lib/clipPosting.ts included) — every evaluated
 * clip with a video attached posts immediately regardless of
 * copyrightRisk, per the owner's explicit, repeated instruction that
 * nothing here should sit as a draft (README.md step 27, reconfirmed
 * directly for this specific gate afterward). This file trusts
 * whatever payload it's given the same way every other executor does,
 * same shape as sendEmail.ts.
 */
export function createPostClipYoutubeExecutor(
  clipStore: ClipStore,
  oauthCredentialStore: OAuthCredentialStore,
  uploadClient: YouTubeUploadClient,
  clientId: string,
  clientSecret: string
): ExecutorFn {
  return async (payload, context) => {
    const input = assertPayload(payload)

    const clip = await clipStore.get(input.clipId)
    if (!clip) throw new Error(`no such clip: ${input.clipId}`)
    if (clip.youtubeVideoId) {
      // Fail closed on a double-post rather than silently re-uploading —
      // two concurrent approvals of the same clip is exactly the kind of
      // race invariant #2 ("audit before execute") exists to make safe
      // to detect after the fact, not just before.
      throw new Error(`clip ${input.clipId} was already posted to YouTube as ${clip.youtubeVideoId}`)
    }

    const credential = await oauthCredentialStore.get(context.businessId, 'youtube')
    if (!credential) {
      throw new Error(
        `business ${context.businessId} has no YouTube credential — connect it from the Growth page first`
      )
    }

    let accessToken = credential.accessToken
    if (new Date(credential.expiresAt).getTime() - REFRESH_SKEW_MS <= Date.now()) {
      const refreshed = await uploadClient.refreshAccessToken(clientId, clientSecret, credential.refreshToken)
      accessToken = refreshed.accessToken
      await oauthCredentialStore.save(context.businessId, 'youtube', {
        accessToken: refreshed.accessToken,
        refreshToken: credential.refreshToken,
        expiresAt: refreshed.expiresAt,
        scope: credential.scope,
      })
    }

    const video = Buffer.from(input.videoBase64, 'base64')
    const result = await uploadClient.uploadVideo(
      accessToken,
      {
        title: input.title,
        description: input.description,
        tags: input.tags,
        privacyStatus: input.privacyStatus,
        // TrendRush content is never children's content — explicit false
        // rather than leaving it unset, so the field is never silently
        // missing from an upload.
        madeForKids: false,
      },
      video,
      input.mimeType
    )

    await clipStore.markPosted(input.clipId, 'youtube', result.videoId)

    return { videoId: result.videoId, url: `https://youtu.be/${result.videoId}` }
  }
}

/**
 * Wires real Postgres-backed stores and the real YouTube HTTP client,
 * then registers 'post_clip_youtube'. Same not-run-on-import shape as
 * registerSendEmailExecutor — needs env vars and a real database, so
 * each consumer that wants this action to actually execute calls it
 * once at process start.
 */
export function registerPostClipYoutubeExecutor(clipStore?: ClipStore, oauthCredentialStore?: OAuthCredentialStore): void {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_CLIENT_SECRET are not set.')
  }
  registerExecutor(
    'post_clip_youtube',
    createPostClipYoutubeExecutor(
      clipStore ?? createPostgresClipStore(),
      oauthCredentialStore ?? createPostgresOAuthCredentialStore(),
      createYouTubeUploadHttpClient(),
      clientId,
      clientSecret
    )
  )
}
