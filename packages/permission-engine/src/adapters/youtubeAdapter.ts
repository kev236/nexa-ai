export type YouTubeChannelStats = {
  channelId: string
  title: string
  subscriberCount: number
}

/** Only what this needs — keeps it unit-testable without a real YouTube client. */
export type YouTubeClient = {
  getChannelStatsByHandle(handle: string): Promise<YouTubeChannelStats>
}

type YouTubeChannelListResponse = {
  items?: Array<{
    id: string
    snippet: { title: string }
    statistics: { subscriberCount?: string; hiddenSubscriberCount: boolean }
  }>
}

/**
 * Step 24 (Growth automation): real subscriber counts for TrendRush's
 * YouTube channel, replacing the hand-typed number on the dashboard's
 * Growth page for this one platform. Uses channels.list with an API key
 * only — subscriber/view counts on a public channel are public data, not
 * data belonging to a specific Google user, so this needs no OAuth
 * consent flow (unlike a future publish/upload capability, which would).
 */
export function createYouTubeHttpClient(apiKey: string): YouTubeClient {
  return {
    async getChannelStatsByHandle(handle) {
      const cleanHandle = handle.replace(/^@/, '')
      const url = new URL('https://www.googleapis.com/youtube/v3/channels')
      url.searchParams.set('part', 'statistics,snippet')
      url.searchParams.set('forHandle', cleanHandle)
      url.searchParams.set('key', apiKey)

      const response = await fetch(url)
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`YouTube Data API returned HTTP ${response.status}: ${detail}`)
      }
      const body = (await response.json()) as YouTubeChannelListResponse
      const item = body.items?.[0]
      if (!item) {
        throw new Error(`No YouTube channel found for handle "${handle}"`)
      }
      if (item.statistics.hiddenSubscriberCount) {
        throw new Error(`Channel "${handle}" has hidden its subscriber count — cannot track it via the public API`)
      }
      return {
        channelId: item.id,
        title: item.snippet.title,
        subscriberCount: Number(item.statistics.subscriberCount ?? 0),
      }
    },
  }
}

/** Fetches real stats for one channel — the one thing db/syncYouTubeFollowers.mjs needs. */
export async function fetchYouTubeSubscriberCount(
  client: YouTubeClient,
  handle: string
): Promise<YouTubeChannelStats> {
  return client.getChannelStatsByHandle(handle)
}
