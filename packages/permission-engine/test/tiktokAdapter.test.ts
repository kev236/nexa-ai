import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTikTokOAuthHttpClient } from '../src/adapters/tiktokAdapter.js'

describe('createTikTokOAuthHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('exchangeCode', () => {
    it('exchanges an authorization code for tokens', async () => {
      const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
        expect(String(init?.body)).toContain('grant_type=authorization_code')
        expect(String(init?.body)).toContain('code=auth_code_1')
        expect(String(init?.body)).toContain('code_verifier=verifier_1')
        return new Response(
          JSON.stringify({
            open_id: 'open_1',
            scope: 'user.info.basic,video.list',
            access_token: 'at_1',
            expires_in: 86400,
            refresh_token: 'rt_1',
            refresh_expires_in: 31536000,
            token_type: 'Bearer',
          }),
          { status: 200 }
        )
      })
      vi.stubGlobal('fetch', fetchMock)

      const client = createTikTokOAuthHttpClient()
      const result = await client.exchangeCode('key', 'secret', 'auth_code_1', 'https://example.com/callback', 'verifier_1')

      expect(result.openId).toBe('open_1')
      expect(result.accessToken).toBe('at_1')
      expect(result.refreshToken).toBe('rt_1')
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
      expect(new Date(result.refreshExpiresAt).getTime()).toBeGreaterThan(Date.now())
    })

    it('throws a clear error on a failed exchange', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({ error: 'invalid_request', error_description: 'Redirect_uri is not matched' }),
              { status: 400 }
            )
        )
      )
      const client = createTikTokOAuthHttpClient()
      await expect(
        client.exchangeCode('key', 'secret', 'bad_code', 'https://example.com/callback', 'verifier_1')
      ).rejects.toThrow(/invalid_request/)
    })
  })

  describe('refreshAccessToken', () => {
    it('refreshes using a refresh token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string | URL, init?: RequestInit) => {
          expect(String(init?.body)).toContain('grant_type=refresh_token')
          return new Response(
            JSON.stringify({
              open_id: 'open_1',
              scope: 'user.info.basic',
              access_token: 'at_new',
              expires_in: 86400,
              refresh_token: 'rt_new',
              refresh_expires_in: 31536000,
              token_type: 'Bearer',
            }),
            { status: 200 }
          )
        })
      )
      const client = createTikTokOAuthHttpClient()
      const result = await client.refreshAccessToken('key', 'secret', 'rt_1')
      expect(result.accessToken).toBe('at_new')
      // TikTok's own doc: the returned refresh_token may differ from the one passed in — must use the new one.
      expect(result.refreshToken).toBe('rt_new')
    })
  })

  describe('revokeToken', () => {
    it('resolves on a successful revoke', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
      const client = createTikTokOAuthHttpClient()
      await expect(client.revokeToken('key', 'secret', 'at_1')).resolves.toBeUndefined()
    })

    it('throws a clear error on a failed revoke', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify({ error: 'invalid_request', error_description: 'bad token' }), { status: 400 })
        )
      )
      const client = createTikTokOAuthHttpClient()
      await expect(client.revokeToken('key', 'secret', 'bad_token')).rejects.toThrow(/invalid_request/)
    })
  })
})
