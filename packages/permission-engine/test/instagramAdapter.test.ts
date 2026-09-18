import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInstagramHttpClient } from '../src/adapters/instagramAdapter.js'

describe('createInstagramHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exchanges a code for a short-lived token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        expect(String(url)).toContain('/oauth/access_token')
        expect(String(url)).toContain('code=auth_code_1')
        return new Response(JSON.stringify({ access_token: 'short_1', expires_in: 3600 }), { status: 200 })
      })
    )
    const client = createInstagramHttpClient()
    const result = await client.exchangeCode('app_1', 'secret_1', 'auth_code_1', 'https://example.com/callback')
    expect(result.accessToken).toBe('short_1')
  })

  it('exchanges a short-lived token for a long-lived one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        expect(String(url)).toContain('grant_type=fb_exchange_token')
        return new Response(JSON.stringify({ access_token: 'long_1', expires_in: 5_184_000 }), { status: 200 })
      })
    )
    const client = createInstagramHttpClient()
    const result = await client.exchangeForLongLivedToken('app_1', 'secret_1', 'short_1')
    expect(result.accessToken).toBe('long_1')
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('lists connected pages with their Instagram Business Account id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'page_1', access_token: 'page_at_1', instagram_business_account: { id: 'ig_1' } },
              { id: 'page_2', access_token: 'page_at_2' },
            ],
          }),
          { status: 200 }
        )
      )
    )
    const client = createInstagramHttpClient()
    const pages = await client.listConnectedPages('user_at_1')
    expect(pages).toEqual([
      { pageId: 'page_1', pageAccessToken: 'page_at_1', instagramBusinessAccountId: 'ig_1' },
      { pageId: 'page_2', pageAccessToken: 'page_at_2', instagramBusinessAccountId: undefined },
    ])
  })

  it('creates a media container and returns its id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        expect(String(init?.body)).toContain('media_type=REELS')
        return new Response(JSON.stringify({ id: 'container_1' }), { status: 200 })
      })
    )
    const client = createInstagramHttpClient()
    const id = await client.createMediaContainer('page_at_1', 'ig_1', 'https://example.com/clip.mp4', 'caption text')
    expect(id).toBe('container_1')
  })

  it('reports container status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status_code: 'FINISHED' }), { status: 200 }))
    )
    const client = createInstagramHttpClient()
    const status = await client.getContainerStatus('page_at_1', 'container_1')
    expect(status.statusCode).toBe('FINISHED')
  })

  it('publishes a container and returns the media id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        expect(String(init?.body)).toContain('creation_id=container_1')
        return new Response(JSON.stringify({ id: 'media_1' }), { status: 200 })
      })
    )
    const client = createInstagramHttpClient()
    const mediaId = await client.publishContainer('page_at_1', 'ig_1', 'container_1')
    expect(mediaId).toBe('media_1')
  })

  it('throws a clear error on a Graph API error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 400 }))
    )
    const client = createInstagramHttpClient()
    await expect(client.listConnectedPages('bad_token')).rejects.toThrow(/Invalid OAuth access token/)
  })
})
