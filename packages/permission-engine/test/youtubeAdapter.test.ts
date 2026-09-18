import { afterEach, describe, expect, it, vi } from 'vitest'
import { createYouTubeHttpClient, fetchYouTubeSubscriberCount, type YouTubeClient } from '../src/adapters/youtubeAdapter.js'

function fakeYouTubeClient(stats: { channelId: string; title: string; subscriberCount: number }): YouTubeClient {
  return {
    async getChannelStatsByHandle() {
      return stats
    },
  }
}

describe('fetchYouTubeSubscriberCount', () => {
  it('delegates to the injected client', async () => {
    const client = fakeYouTubeClient({ channelId: 'UC123', title: 'trendrush', subscriberCount: 42 })
    const stats = await fetchYouTubeSubscriberCount(client, '@trendrush-v6h')
    expect(stats).toEqual({ channelId: 'UC123', title: 'trendrush', subscriberCount: 42 })
  })
})

describe('createYouTubeHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('strips a leading @ and returns parsed stats from a real-shaped response', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain('forHandle=trendrush-v6h')
      expect(String(url)).not.toContain('forHandle=%40')
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'UCwhNUGckHNngtjSad8A3sog',
              snippet: { title: 'trendrush' },
              statistics: { subscriberCount: '1', hiddenSubscriberCount: false },
            },
          ],
        }),
        { status: 200 }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = createYouTubeHttpClient('fake-key')
    const stats = await client.getChannelStatsByHandle('@trendrush-v6h')

    expect(stats).toEqual({ channelId: 'UCwhNUGckHNngtjSad8A3sog', title: 'trendrush', subscriberCount: 1 })
  })

  it('throws a clear error when no channel matches the handle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }))
    )
    const client = createYouTubeHttpClient('fake-key')
    await expect(client.getChannelStatsByHandle('@nonexistent')).rejects.toThrow(/no youtube channel found/i)
  })

  it('throws a clear error when the channel has hidden its subscriber count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'UC1',
                  snippet: { title: 'private-count-channel' },
                  statistics: { hiddenSubscriberCount: true },
                },
              ],
            }),
            { status: 200 }
          )
      )
    )
    const client = createYouTubeHttpClient('fake-key')
    await expect(client.getChannelStatsByHandle('@private-count-channel')).rejects.toThrow(/hidden its subscriber count/i)
  })

  it('throws on a non-OK HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('quota exceeded', { status: 403 }))
    )
    const client = createYouTubeHttpClient('fake-key')
    await expect(client.getChannelStatsByHandle('@trendrush-v6h')).rejects.toThrow(/HTTP 403/)
  })
})
