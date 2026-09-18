import type { JsonValue } from '../json.js'
import type { ClipStore } from '../clips/store.js'
import type { OAuthCredentialStore } from '../oauthCredentials/store.js'
import type { TikTokOAuthClient } from '../adapters/tiktokAdapter.js'
import { createTikTokOAuthHttpClient } from '../adapters/tiktokAdapter.js'
import type { TikTokPrivacyLevel, TikTokUploadClient } from '../adapters/tiktokUploadAdapter.js'
import { createTikTokUploadHttpClient } from '../adapters/tiktokUploadAdapter.js'
import { createPostgresClipStore } from '../clips/postgresStore.js'
import { createPostgresOAuthCredentialStore } from '../oauthCredentials/postgresStore.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

type PostClipTiktokPayload = {
  clipId: string
  title: string
  videoBase64: string
  mimeType: string
  privacyStatus: 'public' | 'unlisted' | 'private'
}

function assertPayload(payload: JsonValue): PostClipTiktokPayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new TypeError('post_clip_tiktok payload must be an object')
  }
  const p = payload as Record<string, unknown>
  if (typeof p.clipId !== 'string' || !p.clipId) throw new TypeError('post_clip_tiktok payload missing clipId')
  if (typeof p.title !== 'string' || !p.title) throw new TypeError('post_clip_tiktok payload missing title')
  if (typeof p.videoBase64 !== 'string' || !p.videoBase64) {
    throw new TypeError('post_clip_tiktok payload missing videoBase64')
  }
  if (typeof p.mimeType !== 'string' || !p.mimeType) throw new TypeError('post_clip_tiktok payload missing mimeType')
  if (p.privacyStatus !== 'public' && p.privacyStatus !== 'unlisted' && p.privacyStatus !== 'private') {
    throw new TypeError('post_clip_tiktok payload privacyStatus must be public, unlisted, or private')
  }
  return {
    clipId: p.clipId,
    title: p.title,
    videoBase64: p.videoBase64,
    mimeType: p.mimeType,
    privacyStatus: p.privacyStatus,
  }
}

// TikTok has no exact analog of YouTube's "unlisted" — FOLLOWER_OF_CREATOR
// (visible only to the connected account's own followers) is the closest
// fit, a judgment call rather than a documented equivalence.
const PRIVACY_MAP: Record<PostClipTiktokPayload['privacyStatus'], TikTokPrivacyLevel> = {
  public: 'PUBLIC_TO_EVERYONE',
  unlisted: 'FOLLOWER_OF_CREATOR',
  private: 'SELF_ONLY',
}

const REFRESH_SKEW_MS = 60_000

/**
 * Step 29: TrendRush's TikTok equivalent of postClipYoutube.ts — same
 * shape (fail-closed double-post guard, refresh-then-upload, no
 * copyright gate, matching the owner's instruction covering every
 * platform this business posts to, not just YouTube), different
 * mechanics: TikTok's Content Posting API is init-then-chunked-PUT
 * rather than YouTube's single multipart request, and an *unaudited*
 * TikTok app (the state this will be in until the owner's API client
 * passes TikTok's own review) is forced to SELF_ONLY regardless of
 * what privacyStatus requests — same shape as YouTube's own
 * verification-gated Private cap, TikTok enforces this server-side.
 *
 * Not exercised against a live TikTok account from this sandbox — see
 * tiktokUploadAdapter.ts's own comment on what's confirmed vs sourced
 * from third-party guides.
 */
export function createPostClipTiktokExecutor(
  clipStore: ClipStore,
  oauthCredentialStore: OAuthCredentialStore,
  oauthClient: TikTokOAuthClient,
  uploadClient: TikTokUploadClient,
  clientKey: string,
  clientSecret: string
): ExecutorFn {
  return async (payload, context) => {
    const input = assertPayload(payload)

    const clip = await clipStore.get(input.clipId)
    if (!clip) throw new Error(`no such clip: ${input.clipId}`)
    if (clip.tiktokPublishId) {
      throw new Error(`clip ${input.clipId} was already posted to TikTok as ${clip.tiktokPublishId}`)
    }

    const credential = await oauthCredentialStore.get(context.businessId, 'tiktok')
    if (!credential) {
      throw new Error(`business ${context.businessId} has no TikTok credential — connect it from the Growth page first`)
    }

    let accessToken = credential.accessToken
    if (new Date(credential.expiresAt).getTime() - REFRESH_SKEW_MS <= Date.now()) {
      const refreshed = await oauthClient.refreshAccessToken(clientKey, clientSecret, credential.refreshToken)
      accessToken = refreshed.accessToken
      await oauthCredentialStore.save(context.businessId, 'tiktok', {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        scope: refreshed.scope,
        externalAccountId: credential.externalAccountId,
      })
    }

    const video = Buffer.from(input.videoBase64, 'base64')
    const { publishId, uploadUrl } = await uploadClient.initVideoPost(
      accessToken,
      { title: input.title, privacyLevel: PRIVACY_MAP[input.privacyStatus] },
      video.length
    )
    await uploadClient.uploadVideo(uploadUrl, video)

    await clipStore.markPosted(input.clipId, 'tiktok', publishId)

    return { publishId }
  }
}

export function registerPostClipTiktokExecutor(clipStore?: ClipStore, oauthCredentialStore?: OAuthCredentialStore): void {
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  if (!clientKey || !clientSecret) {
    throw new Error('TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are not set.')
  }
  registerExecutor(
    'post_clip_tiktok',
    createPostClipTiktokExecutor(
      clipStore ?? createPostgresClipStore(),
      oauthCredentialStore ?? createPostgresOAuthCredentialStore(),
      createTikTokOAuthHttpClient(),
      createTikTokUploadHttpClient(),
      clientKey,
      clientSecret
    )
  )
}
