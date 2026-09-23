import type { JsonValue } from '../json.js'
import type { ClipStore } from '../clips/store.js'
import type { OAuthCredentialStore } from '../oauthCredentials/store.js'
import type { InstagramClient } from '../adapters/instagramAdapter.js'
import { createInstagramHttpClient } from '../adapters/instagramAdapter.js'
import { createPostgresClipStore } from '../clips/postgresStore.js'
import { createPostgresOAuthCredentialStore } from '../oauthCredentials/postgresStore.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

type PostClipInstagramPayload = {
  clipId: string
  /**
   * Must be a URL Meta's own servers can fetch — Instagram's publish
   * API has no direct-byte-upload path the way YouTube/TikTok do.
   * clipPosting.ts only calls this executor when the clip's original
   * sourceUrl is itself public; a clip the owner only ever attached as
   * a raw file upload has no public URL to offer and can't post to
   * Instagram through this path.
   */
  videoUrl: string
  caption: string
}

function assertPayload(payload: JsonValue): PostClipInstagramPayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new TypeError('post_clip_instagram payload must be an object')
  }
  const p = payload as Record<string, unknown>
  if (typeof p.clipId !== 'string' || !p.clipId) throw new TypeError('post_clip_instagram payload missing clipId')
  if (typeof p.videoUrl !== 'string' || !p.videoUrl) throw new TypeError('post_clip_instagram payload missing videoUrl')
  if (typeof p.caption !== 'string') throw new TypeError('post_clip_instagram payload missing caption')
  return { clipId: p.clipId, videoUrl: p.videoUrl, caption: p.caption }
}

const REFRESH_SKEW_MS = 24 * 3600_000 // long-lived tokens run ~60 days; re-extend a day out rather than cutting it close
const POLL_INTERVAL_MS = 4_000
const MAX_POLL_MS = 50_000 // stays inside a typical serverless function's time budget — see this file's own comment below

/**
 * Step 29: TrendRush's Instagram equivalent of postClipYoutube.ts.
 * Structurally different from YouTube/TikTok in two real ways, not
 * just different endpoints:
 *
 * 1. Instagram's container-based publish (create container with a
 *    public video_url, poll until Meta finishes processing it, then
 *    publish the container) needs a URL Meta can fetch — it never
 *    accepts raw bytes. There is no upload step here to mirror
 *    YouTube/TikTok's.
 * 2. Meta's own guidance is to poll roughly once a minute for up to 5
 *    minutes before giving up — too long to hold open synchronously in
 *    a typical serverless function. This polls faster (every 4s) for a
 *    shorter window (50s) instead, which real 2026 integration guides
 *    describe as enough for most short clips to finish processing, and
 *    throws a clear, honest error naming the container id if it isn't
 *    finished in time rather than either blocking indefinitely or
 *    silently giving up — the owner (or a future retry path) can still
 *    publish that container later using the id in the error.
 *
 * Not exercised against a live Instagram account from this sandbox —
 * see instagramAdapter.ts's own comment on what's confirmed vs sourced
 * from third-party guides.
 */
export function createPostClipInstagramExecutor(
  clipStore: ClipStore,
  oauthCredentialStore: OAuthCredentialStore,
  client: InstagramClient,
  appId: string,
  appSecret: string,
  // Overridable only so tests can exercise the "never finishes" path
  // without a real 50s wait — production callers use the defaults.
  pollOptions: { maxPollMs?: number; pollIntervalMs?: number } = {}
): ExecutorFn {
  const maxPollMs = pollOptions.maxPollMs ?? MAX_POLL_MS
  const pollIntervalMs = pollOptions.pollIntervalMs ?? POLL_INTERVAL_MS
  return async (payload, context) => {
    const input = assertPayload(payload)

    const clip = await clipStore.get(input.clipId)
    if (!clip) throw new Error(`no such clip: ${input.clipId}`)
    if (clip.instagramMediaId) {
      throw new Error(`clip ${input.clipId} was already posted to Instagram as ${clip.instagramMediaId}`)
    }

    const credential = await oauthCredentialStore.get(context.businessId, 'instagram')
    if (!credential) {
      throw new Error(`business ${context.businessId} has no Instagram credential — connect it from the Growth page first`)
    }
    if (!credential.externalAccountId) {
      throw new Error(
        `business ${context.businessId}'s Instagram connection has no linked Instagram Business Account id — reconnect from the Growth page`
      )
    }

    let pageAccessToken = credential.accessToken
    let igUserId = credential.externalAccountId
    if (new Date(credential.expiresAt).getTime() - REFRESH_SKEW_MS <= Date.now()) {
      // credential.refreshToken holds the long-lived *user* token (see
      // api/oauth/instagram/callback/route.ts) — re-extend it, then
      // re-derive the Page token and IG account id from it, rather than
      // trusting the previously stored Page token to still be fresh.
      const extended = await client.exchangeForLongLivedToken(appId, appSecret, credential.refreshToken)
      const pages = await client.listConnectedPages(extended.accessToken)
      const withInstagram = pages.find((p) => p.instagramBusinessAccountId)
      if (!withInstagram?.instagramBusinessAccountId) {
        throw new Error('No Facebook Page with a linked Instagram Business Account found on re-authorization — reconnect from the Growth page')
      }
      pageAccessToken = withInstagram.pageAccessToken
      igUserId = withInstagram.instagramBusinessAccountId
      await oauthCredentialStore.save(context.businessId, 'instagram', {
        accessToken: pageAccessToken,
        refreshToken: extended.accessToken,
        expiresAt: extended.expiresAt,
        scope: credential.scope,
        externalAccountId: igUserId,
      })
    }

    const containerId = await client.createMediaContainer(pageAccessToken, igUserId, input.videoUrl, input.caption)

    const deadline = Date.now() + maxPollMs
    let statusCode = 'IN_PROGRESS'
    while (Date.now() < deadline) {
      const status = await client.getContainerStatus(pageAccessToken, containerId)
      statusCode = status.statusCode
      if (statusCode === 'FINISHED') break
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new Error(`Instagram container ${containerId} failed processing: ${statusCode} ${status.statusDetail ?? ''}`.trim())
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
    if (statusCode !== 'FINISHED') {
      throw new Error(
        `Instagram container ${containerId} did not finish processing within ${maxPollMs / 1000}s (last status: ${statusCode}) — it may still finish; check and publish it manually rather than retrying, which would create a duplicate container`
      )
    }

    const mediaId = await client.publishContainer(pageAccessToken, igUserId, containerId)
    await clipStore.markPosted(input.clipId, 'instagram', mediaId)

    return { mediaId }
  }
}

export function registerPostClipInstagramExecutor(clipStore?: ClipStore, oauthCredentialStore?: OAuthCredentialStore): void {
  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET are not set.')
  }
  registerExecutor(
    'post_clip_instagram',
    createPostClipInstagramExecutor(
      clipStore ?? createPostgresClipStore(),
      oauthCredentialStore ?? createPostgresOAuthCredentialStore(),
      createInstagramHttpClient(),
      appId,
      appSecret
    )
  )
}
