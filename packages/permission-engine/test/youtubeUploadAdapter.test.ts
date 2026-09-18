import { afterEach, describe, expect, it, vi } from 'vitest'
import { createYouTubeUploadHttpClient } from '../src/adapters/youtubeUploadAdapter.js'

describe('createYouTubeUploadHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('refreshAccessToken', () => {
    it('exchanges a refresh token for a new access token', async () => {
      const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
        expect(String(init?.body)).toContain('grant_type=refresh_token')
        expect(String(init?.body)).toContain('refresh_token=rt_1')
        return new Response(JSON.stringify({ access_token: 'at_new', expires_in: 3600 }), { status: 200 })
      })
      vi.stubGlobal('fetch', fetchMock)

      const client = createYouTubeUploadHttpClient()
      const result = await client.refreshAccessToken('client_id', 'client_secret', 'rt_1')

      expect(result.accessToken).toBe('at_new')
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
    })

    it('throws a clear error when Google rejects the refresh token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token expired' }), { status: 400 }))
      )
      const client = createYouTubeUploadHttpClient()
      await expect(client.refreshAccessToken('id', 'secret', 'rt_bad')).rejects.toThrow(/invalid_grant/)
    })
  })

  describe('uploadVideo', () => {
    it('POSTs a multipart/related body with the metadata and video bytes', async () => {
      let capturedInit: RequestInit | undefined
      const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toContain('uploadType=multipart')
        capturedInit = init
        return new Response(JSON.stringify({ id: 'vid_123' }), { status: 200 })
      })
      vi.stubGlobal('fetch', fetchMock)

      const client = createYouTubeUploadHttpClient()
      const video = Buffer.from('fake video bytes')
      const result = await client.uploadVideo(
        'at_1',
        { title: 'A clip', description: 'desc', tags: ['a', 'b'], privacyStatus: 'unlisted' },
        video,
        'video/mp4'
      )

      expect(result).toEqual({ videoId: 'vid_123' })
      expect(capturedInit?.headers).toMatchObject({ Authorization: 'Bearer at_1' })
      const contentType = (capturedInit?.headers as Record<string, string>)['Content-Type']
      expect(contentType).toMatch(/^multipart\/related; boundary=/)
      const body = capturedInit?.body as Buffer
      expect(body.toString('utf8')).toContain('"title":"A clip"')
      expect(body.toString('utf8')).toContain('"privacyStatus":"unlisted"')
      expect(body.includes(video)).toBe(true)
    })

    it('throws a clear error on a failed upload', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 403 }))
      )
      const client = createYouTubeUploadHttpClient()
      await expect(
        client.uploadVideo('at_1', { title: 't', description: '', tags: [], privacyStatus: 'private' }, Buffer.from('x'), 'video/mp4')
      ).rejects.toThrow(/quota exceeded/)
    })
  })
})
