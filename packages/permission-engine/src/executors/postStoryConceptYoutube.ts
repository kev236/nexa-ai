import type { JsonValue } from '../json.js'
import type { StoryConceptStore } from '../storyConcepts/store.js'
import type { OAuthCredentialStore } from '../oauthCredentials/store.js'
import type { YouTubeUploadClient } from '../adapters/youtubeUploadAdapter.js'
import { createYouTubeUploadHttpClient } from '../adapters/youtubeUploadAdapter.js'
import { createPostgresStoryConceptStore } from '../storyConcepts/postgresStore.js'
import { createPostgresOAuthCredentialStore } from '../oauthCredentials/postgresStore.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

type PostStoryConceptYoutubePayload = {
  conceptId: string
  title: string
  description: string
  tags: string[]
  videoBase64: string
  mimeType: string
  privacyStatus: 'public' | 'unlisted' | 'private'
}

function assertPayload(payload: JsonValue): PostStoryConceptYoutubePayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new TypeError('post_story_concept_youtube payload must be an object')
  }
  const p = payload as Record<string, unknown>
  if (typeof p.conceptId !== 'string' || !p.conceptId) {
    throw new TypeError('post_story_concept_youtube payload missing conceptId')
  }
  if (typeof p.title !== 'string' || !p.title) throw new TypeError('post_story_concept_youtube payload missing title')
  if (typeof p.description !== 'string') throw new TypeError('post_story_concept_youtube payload missing description')
  if (!Array.isArray(p.tags) || !p.tags.every((t) => typeof t === 'string')) {
    throw new TypeError('post_story_concept_youtube payload tags must be a string array')
  }
  if (typeof p.videoBase64 !== 'string' || !p.videoBase64) {
    throw new TypeError('post_story_concept_youtube payload missing videoBase64')
  }
  if (typeof p.mimeType !== 'string' || !p.mimeType) {
    throw new TypeError('post_story_concept_youtube payload missing mimeType')
  }
  if (p.privacyStatus !== 'public' && p.privacyStatus !== 'unlisted' && p.privacyStatus !== 'private') {
    throw new TypeError('post_story_concept_youtube payload privacyStatus must be public, unlisted, or private')
  }
  return {
    conceptId: p.conceptId,
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
 * Sproutlight's equivalent of executors/postClipYoutube.ts — same
 * shape, different store: uploads a real video for a story concept to
 * Sproutlight's connected YouTube channel once one exists (this
 * executor doesn't generate video itself; something upstream — the
 * owner, or a real generation step — has to produce it first).
 *
 * Unlike TrendRush's clips, a story concept is 100% original AI-
 * generated content — no repost, no other creator's footage, no
 * copyright-risk gate to enforce here. dashboard's storyConceptPosting.ts
 * is the equivalent of clipPosting.ts for this action.
 */
export function createPostStoryConceptYoutubeExecutor(
  storyConceptStore: StoryConceptStore,
  oauthCredentialStore: OAuthCredentialStore,
  uploadClient: YouTubeUploadClient,
  clientId: string,
  clientSecret: string
): ExecutorFn {
  return async (payload, context) => {
    const input = assertPayload(payload)

    const concept = await storyConceptStore.get(input.conceptId)
    if (!concept) throw new Error(`no such story concept: ${input.conceptId}`)
    if (concept.youtubeVideoId) {
      // Fail closed on a double-post rather than silently re-uploading —
      // same reasoning as postClipYoutube.ts.
      throw new Error(
        `story concept ${input.conceptId} was already posted to YouTube as ${concept.youtubeVideoId}`
      )
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
        // Sproutlight is exclusively children's content — every upload
        // through this executor is "made for kids" by construction, not
        // something to trust from the payload. YouTube enforces real
        // restrictions off this flag (no personalized ads, comments and
        // notifications off, etc.), so getting it right here is a COPPA
        // compliance requirement, not a preference.
        madeForKids: true,
      },
      video,
      input.mimeType
    )

    await storyConceptStore.markPosted(input.conceptId, result.videoId)

    return { videoId: result.videoId, url: `https://youtu.be/${result.videoId}` }
  }
}

/**
 * Wires real Postgres-backed stores and the real YouTube HTTP client,
 * then registers 'post_story_concept_youtube'. Same not-run-on-import
 * shape as registerPostClipYoutubeExecutor — needs env vars and a real
 * database, so each consumer that wants this action to actually
 * execute calls it once at process start.
 */
export function registerPostStoryConceptYoutubeExecutor(
  storyConceptStore?: StoryConceptStore,
  oauthCredentialStore?: OAuthCredentialStore
): void {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_CLIENT_SECRET are not set.')
  }
  registerExecutor(
    'post_story_concept_youtube',
    createPostStoryConceptYoutubeExecutor(
      storyConceptStore ?? createPostgresStoryConceptStore(),
      oauthCredentialStore ?? createPostgresOAuthCredentialStore(),
      createYouTubeUploadHttpClient(),
      clientId,
      clientSecret
    )
  )
}
