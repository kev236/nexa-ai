export type TikTokPrivacyLevel = 'PUBLIC_TO_EVERYONE' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'

export type TikTokPostMetadata = {
  title: string
  privacyLevel: TikTokPrivacyLevel
}

export type TikTokInitResult = { publishId: string; uploadUrl: string }
export type TikTokPostStatus = { status: string; failReason?: string }

/** Only what this needs — keeps it unit-testable without a real TikTok client. */
export type TikTokUploadClient = {
  initVideoPost(accessToken: string, metadata: TikTokPostMetadata, videoSizeBytes: number): Promise<TikTokInitResult>
  uploadVideo(uploadUrl: string, video: Buffer): Promise<void>
  getPostStatus(accessToken: string, publishId: string): Promise<TikTokPostStatus>
}

const INIT_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
const STATUS_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'

// TikTok requires each chunk 5MB-64MB except the final one, for a
// multi-chunk FILE_UPLOAD (per cross-checked third-party 2026 guides —
// see this file's own top-of-module caveat). 8MB stays safely inside
// that band while keeping the chunk count reasonable for the existing
// 200MB clip cap (videoInput.ts's MAX_VIDEO_BYTES) — at most 25 PUTs.
const CHUNK_SIZE = 8 * 1024 * 1024
// Below this, TikTok's single-chunk mode applies: chunk_size equals the
// whole file and total_chunk_count is 1.
const SINGLE_CHUNK_THRESHOLD = CHUNK_SIZE

type TikTokApiError = { code?: string; message?: string; log_id?: string }

function assertOk(body: { error?: TikTokApiError }, context: string): void {
  if (body.error && body.error.code && body.error.code !== 'ok') {
    throw new Error(`TikTok ${context} failed: ${body.error.code} ${body.error.message ?? ''}`.trim())
  }
}

/**
 * The Content Posting API's video-publish flow: init (declares size/
 * chunking, gets back a publish_id and a short-lived upload_url),
 * upload (PUT the bytes, chunked when large), and a status check the
 * caller can poll afterward (this file doesn't poll itself — same
 * "don't invent a background job for something no caller asked for"
 * reasoning as postClipYoutube.ts not polling YouTube's own processing
 * state).
 *
 * NOT verified against TikTok's own docs — developers.tiktok.com is
 * blocked by this sandbox's network egress. Built from cross-checked
 * third-party 2026 integration guides describing the same endpoint
 * paths, field names, and chunk-size bounds independently, which is
 * meaningfully more confidence than one source, but still not the
 * "owner's own pasted API reference" standard tiktokAdapter.ts's
 * original comment held itself to. Confirm the real request/response
 * shape on the first live test post; README.md's step 29 entry has the
 * same caveat.
 */
export function createTikTokUploadHttpClient(): TikTokUploadClient {
  return {
    async initVideoPost(accessToken, metadata, videoSizeBytes) {
      const singleChunk = videoSizeBytes <= SINGLE_CHUNK_THRESHOLD
      const chunkSize = singleChunk ? videoSizeBytes : CHUNK_SIZE
      const totalChunkCount = singleChunk ? 1 : Math.ceil(videoSizeBytes / CHUNK_SIZE)

      const response = await fetch(INIT_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title: metadata.title,
            privacy_level: metadata.privacyLevel,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: videoSizeBytes,
            chunk_size: chunkSize,
            total_chunk_count: totalChunkCount,
          },
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        data?: { publish_id?: string; upload_url?: string }
        error?: TikTokApiError
      }
      if (!response.ok) {
        throw new Error(`TikTok post init failed: HTTP ${response.status} ${body.error?.message ?? ''}`.trim())
      }
      assertOk(body, 'post init')
      if (!body.data?.publish_id || !body.data?.upload_url) {
        throw new Error('TikTok post init response is missing publish_id or upload_url')
      }
      return { publishId: body.data.publish_id, uploadUrl: body.data.upload_url }
    },

    async uploadVideo(uploadUrl, video) {
      const total = video.length
      const singleChunk = total <= SINGLE_CHUNK_THRESHOLD
      const chunkSize = singleChunk ? total : CHUNK_SIZE

      for (let start = 0; start < total; start += chunkSize) {
        const end = Math.min(start + chunkSize, total)
        // Uint8Array.from(...) rather than passing the Buffer subarray
        // directly — Buffer's generic ArrayBufferLike backing isn't
        // assignable to fetch's BodyInit (Uint8Array<ArrayBuffer>) under
        // this project's TS config, a typing friction point, not a real
        // runtime concern (the bytes themselves are identical either way).
        const chunk = Uint8Array.from(video.subarray(start, end))
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes ${start}-${end - 1}/${total}`,
          },
          body: chunk,
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(`TikTok chunk upload failed at byte ${start}: HTTP ${response.status} ${text}`.trim())
        }
      }
    },

    async getPostStatus(accessToken, publishId) {
      const response = await fetch(STATUS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        data?: { status?: string; fail_reason?: string }
        error?: TikTokApiError
      }
      if (!response.ok) {
        throw new Error(`TikTok status fetch failed: HTTP ${response.status} ${body.error?.message ?? ''}`.trim())
      }
      assertOk(body, 'status fetch')
      return { status: body.data?.status ?? 'UNKNOWN', failReason: body.data?.fail_reason }
    },
  }
}
