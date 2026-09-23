import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTikTokUploadHttpClient } from '../src/adapters/tiktokUploadAdapter.js'

describe('createTikTokUploadHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('initVideoPost', () => {
    it('declares a single chunk for a small video and returns publish_id/upload_url', async () => {
      let capturedBody: unknown
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string | URL, init?: RequestInit) => {
          capturedBody = JSON.parse(String(init?.body))
          return new Response(JSON.stringify({ data: { publish_id: 'pub_1', upload_url: 'https://upload.example/x' } }), {
            status: 200,
          })
        })
      )
      const client = createTikTokUploadHttpClient()
      const result = await client.initVideoPost('at_1', { title: 'A clip', privacyLevel: 'SELF_ONLY' }, 1_000_000)

      expect(result).toEqual({ publishId: 'pub_1', uploadUrl: 'https://upload.example/x' })
      expect(capturedBody).toMatchObject({
        post_info: { title: 'A clip', privacy_level: 'SELF_ONLY' },
        source_info: { source: 'FILE_UPLOAD', video_size: 1_000_000, chunk_size: 1_000_000, total_chunk_count: 1 },
      })
    })

    it('declares multiple chunks for a large video', async () => {
      let capturedBody: { source_info?: { chunk_size: number; total_chunk_count: number } } = {}
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string | URL, init?: RequestInit) => {
          capturedBody = JSON.parse(String(init?.body))
          return new Response(JSON.stringify({ data: { publish_id: 'pub_1', upload_url: 'https://upload.example/x' } }), {
            status: 200,
          })
        })
      )
      const client = createTikTokUploadHttpClient()
      const twentyMb = 20 * 1024 * 1024
      await client.initVideoPost('at_1', { title: 'A clip', privacyLevel: 'PUBLIC_TO_EVERYONE' }, twentyMb)

      expect(capturedBody.source_info?.total_chunk_count).toBeGreaterThan(1)
    })

    it('throws a clear error when TikTok returns an error code', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: { code: 'access_token_invalid', message: 'bad token' } }), { status: 200 }))
      )
      const client = createTikTokUploadHttpClient()
      await expect(client.initVideoPost('bad_at', { title: 't', privacyLevel: 'SELF_ONLY' }, 100)).rejects.toThrow(/access_token_invalid/)
    })
  })

  describe('uploadVideo', () => {
    it('PUTs the whole video in one request when it fits in a single chunk', async () => {
      const putCalls: RequestInit[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string | URL, init?: RequestInit) => {
          putCalls.push(init!)
          return new Response('', { status: 200 })
        })
      )
      const client = createTikTokUploadHttpClient()
      const video = Buffer.from('small video bytes')
      await client.uploadVideo('https://upload.example/x', video)

      expect(putCalls).toHaveLength(1)
      expect(putCalls[0]?.headers).toMatchObject({ 'Content-Range': `bytes 0-${video.length - 1}/${video.length}` })
    })

    it('throws a clear error when a chunk PUT fails', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })))
      const client = createTikTokUploadHttpClient()
      await expect(client.uploadVideo('https://upload.example/x', Buffer.from('x'))).rejects.toThrow(/HTTP 500/)
    })
  })

  describe('getPostStatus', () => {
    it('returns the status and fail reason', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ data: { status: 'PUBLISH_COMPLETE' } }), { status: 200 }))
      )
      const client = createTikTokUploadHttpClient()
      const result = await client.getPostStatus('at_1', 'pub_1')
      expect(result).toEqual({ status: 'PUBLISH_COMPLETE', failReason: undefined })
    })
  })
})
