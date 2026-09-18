import { describe, expect, it } from 'vitest'
import { createPostClipTiktokExecutor } from '../src/executors/postClipTiktok.js'
import { InMemoryClipStore } from '../src/clips/memoryStore.js'
import { InMemoryOAuthCredentialStore } from '../src/oauthCredentials/memoryStore.js'
import type { TikTokOAuthClient } from '../src/adapters/tiktokAdapter.js'
import type { TikTokUploadClient } from '../src/adapters/tiktokUploadAdapter.js'

function evaluationInput(overrides: Record<string, unknown> = {}) {
  return {
    sourceDescription: 'a clip',
    title: 'A clip',
    viralityScore: 80,
    copyrightRisk: 'low' as const,
    copyrightNotes: 'Original commentary added throughout.',
    recommendation: 'REPOST',
    captions: [{ platform: 'tiktok' as const, caption: 'Watch this', hashtags: ['fyp'] }],
    reasoning: 'Strong hook.',
    confidence: 0.9,
    ...overrides,
  }
}

function fakeOAuthClient(overrides: Partial<TikTokOAuthClient> = {}): TikTokOAuthClient {
  return {
    exchangeCode: async () => {
      throw new Error('not used by this executor')
    },
    refreshAccessToken: async () => ({
      openId: 'open_1',
      scope: 'video.publish',
      accessToken: 'refreshed_at',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      refreshToken: 'refreshed_rt',
      refreshExpiresAt: new Date(Date.now() + 31_536_000_000).toISOString(),
    }),
    revokeToken: async () => {},
    ...overrides,
  }
}

function fakeUploadClient(overrides: Partial<TikTokUploadClient> = {}): TikTokUploadClient {
  return {
    initVideoPost: async () => ({ publishId: 'pub_1', uploadUrl: 'https://upload.example/x' }),
    uploadVideo: async () => {},
    getPostStatus: async () => ({ status: 'PUBLISH_COMPLETE' }),
    ...overrides,
  }
}

const PAYLOAD = {
  clipId: '',
  title: 'A clip #fyp',
  videoBase64: Buffer.from('fake bytes').toString('base64'),
  mimeType: 'video/mp4',
  privacyStatus: 'public' as const,
}

describe('post_clip_tiktok executor', () => {
  it('uploads the video and marks the clip posted', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'tiktok', {
      accessToken: 'at_1',
      refreshToken: 'rt_1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'video.publish',
      externalAccountId: 'open_1',
    })

    let initedWith: unknown
    const executor = createPostClipTiktokExecutor(
      clipStore,
      oauth,
      fakeOAuthClient(),
      fakeUploadClient({
        initVideoPost: async (accessToken, metadata, size) => {
          initedWith = { accessToken, metadata, size }
          return { publishId: 'pub_1', uploadUrl: 'https://upload.example/x' }
        },
      }),
      'client_key',
      'client_secret'
    )

    const result = await executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(result).toEqual({ publishId: 'pub_1' })
    expect(initedWith).toMatchObject({ accessToken: 'at_1', metadata: { privacyLevel: 'PUBLIC_TO_EVERYONE' } })
    const record = await clipStore.get(clipId)
    expect(record?.tiktokPublishId).toBe('pub_1')
    expect(record?.tiktokPostedAt).toBeDefined()
  })

  it('refreshes an expired access token before uploading, and persists the new one', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'tiktok', {
      accessToken: 'stale_at',
      refreshToken: 'rt_1',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      scope: 'video.publish',
      externalAccountId: 'open_1',
    })

    let usedAccessToken: string | undefined
    const executor = createPostClipTiktokExecutor(
      clipStore,
      oauth,
      fakeOAuthClient(),
      fakeUploadClient({
        initVideoPost: async (accessToken) => {
          usedAccessToken = accessToken
          return { publishId: 'pub_2', uploadUrl: 'https://upload.example/x' }
        },
      }),
      'client_key',
      'client_secret'
    )

    await executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(usedAccessToken).toBe('refreshed_at')
    const credential = await oauth.get('biz_1', 'tiktok')
    expect(credential?.accessToken).toBe('refreshed_at')
  })

  it('throws when the business has no TikTok credential', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const executor = createPostClipTiktokExecutor(
      clipStore,
      new InMemoryOAuthCredentialStore(),
      fakeOAuthClient(),
      fakeUploadClient(),
      'client_key',
      'client_secret'
    )

    await expect(executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(
      /no tiktok credential/i
    )
  })

  it('refuses to double-post a clip that already has a tiktokPublishId', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    await clipStore.markPosted(clipId, 'tiktok', 'pub_existing')
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'tiktok', {
      accessToken: 'at_1',
      refreshToken: 'rt_1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'video.publish',
      externalAccountId: 'open_1',
    })
    const executor = createPostClipTiktokExecutor(clipStore, oauth, fakeOAuthClient(), fakeUploadClient(), 'client_key', 'client_secret')

    await expect(executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(/already posted/i)
  })

  it('rejects a malformed payload', async () => {
    const executor = createPostClipTiktokExecutor(
      new InMemoryClipStore(),
      new InMemoryOAuthCredentialStore(),
      fakeOAuthClient(),
      fakeUploadClient(),
      'client_key',
      'client_secret'
    )
    await expect(executor({ clipId: 'x' }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(TypeError)
  })
})
