// Instagram's publishing capability lives only on the Graph API reached
// through Facebook Login (a linked Facebook Page + Instagram Professional
// account) — the newer, lighter "Instagram API with Instagram Login"
// does not support publishing at all as of the third-party 2026 guides
// cross-checked at write time, so that's not a real alternative here.
// developers.facebook.com is blocked by this sandbox's network egress
// (same limitation as tiktokAdapter.ts), so none of this is confirmed
// against Meta's own docs — see README.md's step 29 entry for the same
// caveat repeated in one place.
const GRAPH_API_VERSION = 'v23.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export type InstagramTokenResult = { accessToken: string; expiresAt: string }

export type InstagramPage = {
  pageId: string
  pageAccessToken: string
  instagramBusinessAccountId?: string
}

export type InstagramContainerStatus = { statusCode: string; statusDetail?: string }

/** Only what this needs — keeps it unit-testable without a real Meta client. */
export type InstagramClient = {
  /** Authorization-code -> short-lived user access token. */
  exchangeCode(appId: string, appSecret: string, code: string, redirectUri: string): Promise<InstagramTokenResult>
  /** Short-lived -> long-lived (~60 day) user access token. Also how an existing long-lived token gets re-extended before it expires. */
  exchangeForLongLivedToken(appId: string, appSecret: string, userAccessToken: string): Promise<InstagramTokenResult>
  /** Every Page the user token can manage, each with its own Page access token and linked IG Business Account id (if any). */
  listConnectedPages(userAccessToken: string): Promise<InstagramPage[]>
  /** media_type=REELS container — video_url must be a URL Meta's servers can fetch, not raw bytes. */
  createMediaContainer(pageAccessToken: string, igUserId: string, videoUrl: string, caption: string): Promise<string>
  getContainerStatus(pageAccessToken: string, containerId: string): Promise<InstagramContainerStatus>
  publishContainer(pageAccessToken: string, igUserId: string, containerId: string): Promise<string>
}

type GraphErrorBody = { error?: { message?: string; type?: string; code?: number } }

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = await fetch(url)
  const body = (await response.json().catch(() => ({}))) as T & GraphErrorBody
  if (!response.ok || body.error) {
    throw new Error(`Instagram Graph API request to ${path} failed: HTTP ${response.status} ${body.error?.message ?? ''}`.trim())
  }
  return body
}

async function graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const body = (await response.json().catch(() => ({}))) as T & GraphErrorBody
  if (!response.ok || body.error) {
    throw new Error(`Instagram Graph API request to ${path} failed: HTTP ${response.status} ${body.error?.message ?? ''}`.trim())
  }
  return body
}

export function createInstagramHttpClient(): InstagramClient {
  return {
    async exchangeCode(appId, appSecret, code, redirectUri) {
      const body = await graphGet<{ access_token: string; expires_in?: number }>('/oauth/access_token', {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      })
      return {
        accessToken: body.access_token,
        // A short-lived token's expires_in is typically ~1-2h when Meta
        // sends one at all; default to 1h so a missing field fails safe
        // (an early, unnecessary refresh) rather than looking valid
        // longer than it is.
        expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString(),
      }
    },

    async exchangeForLongLivedToken(appId, appSecret, userAccessToken) {
      const body = await graphGet<{ access_token: string; expires_in?: number }>('/oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: userAccessToken,
      })
      return {
        accessToken: body.access_token,
        // Long-lived tokens run ~60 days; default conservatively if Meta
        // omits expires_in for some reason.
        expiresAt: new Date(Date.now() + (body.expires_in ?? 60 * 24 * 3600) * 1000).toISOString(),
      }
    },

    async listConnectedPages(userAccessToken) {
      const body = await graphGet<{
        data?: Array<{ id: string; access_token: string; instagram_business_account?: { id: string } }>
      }>('/me/accounts', {
        fields: 'access_token,instagram_business_account',
        access_token: userAccessToken,
      })
      return (body.data ?? []).map((page) => ({
        pageId: page.id,
        pageAccessToken: page.access_token,
        instagramBusinessAccountId: page.instagram_business_account?.id,
      }))
    },

    async createMediaContainer(pageAccessToken, igUserId, videoUrl, caption) {
      const body = await graphPost<{ id: string }>(`/${igUserId}/media`, {
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        access_token: pageAccessToken,
      })
      return body.id
    },

    async getContainerStatus(pageAccessToken, containerId) {
      const body = await graphGet<{ status_code: string; status?: string }>(`/${containerId}`, {
        fields: 'status_code,status',
        access_token: pageAccessToken,
      })
      return { statusCode: body.status_code, statusDetail: body.status }
    },

    async publishContainer(pageAccessToken, igUserId, containerId) {
      const body = await graphPost<{ id: string }>(`/${igUserId}/media_publish`, {
        creation_id: containerId,
        access_token: pageAccessToken,
      })
      return body.id
    },
  }
}
