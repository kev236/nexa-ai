import { randomUUID } from 'node:crypto'

export type YouTubeVideoMetadata = {
  title: string
  description: string
  tags: string[]
  privacyStatus: 'public' | 'unlisted' | 'private'
}

export type YouTubeUploadResult = { videoId: string }
export type YouTubeTokenRefreshResult = { accessToken: string; expiresAt: string }

/** Only what this needs — keeps it unit-testable without a real Google client. */
export type YouTubeUploadClient = {
  refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<YouTubeTokenRefreshResult>
  uploadVideo(accessToken: string, metadata: YouTubeVideoMetadata, video: Buffer, mimeType: string): Promise<YouTubeUploadResult>
}

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status'

/**
 * Step 27 (TrendRush publish capability, the other half of step 25's
 * OAuth consent flow — youtubeAdapter.ts's read-only subscriber-count
 * client is a separate, narrower thing). Real HTTP against Google's
 * OAuth token endpoint and the YouTube Data API's simple (non-resumable)
 * multipart upload — appropriate here since TrendRush reposts short
 * clips, not long-form video; a production pipeline handling large
 * files would want the resumable upload protocol instead.
 *
 * Google's app-verification note from start/route.ts applies here too:
 * until this OAuth app passes Google's compliance audit, every video
 * this uploads comes back `status.uploadStatus: 'uploaded'` but capped
 * at `privacyStatus: 'private'` regardless of what's requested — Google
 * enforces that server-side, not this code.
 */
export function createYouTubeUploadHttpClient(): YouTubeUploadClient {
  return {
    async refreshAccessToken(clientId, clientSecret, refreshToken) {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        access_token?: string
        expires_in?: number
        error?: string
        error_description?: string
      }
      if (!response.ok || !body.access_token) {
        throw new Error(
          `YouTube token refresh failed: HTTP ${response.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim()
        )
      }
      return {
        accessToken: body.access_token,
        expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString(),
      }
    },

    async uploadVideo(accessToken, metadata, video, mimeType) {
      // multipart/related, Google's own format for this endpoint — not
      // the multipart/form-data a browser <form> or fetch's FormData
      // produces. Two parts: a JSON metadata part, then the raw video
      // bytes, joined by a boundary neither part's content could
      // plausibly contain.
      const boundary = `nexaai-${randomUUID()}`
      const metadataPart = JSON.stringify({
        snippet: { title: metadata.title, description: metadata.description, tags: metadata.tags },
        status: { privacyStatus: metadata.privacyStatus },
      })
      const preamble = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n` +
          `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
        'utf8'
      )
      const closing = Buffer.from(`\r\n--${boundary}--`, 'utf8')
      const body = Buffer.concat([preamble, video, closing])

      const response = await fetch(UPLOAD_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      })
      const result = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
      if (!response.ok || !result.id) {
        throw new Error(`YouTube upload failed: HTTP ${response.status} ${result.error?.message ?? ''}`.trim())
      }
      return { videoId: result.id }
    },
  }
}
